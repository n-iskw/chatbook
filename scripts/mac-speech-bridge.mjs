import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

const host = process.env.MAC_SPEECH_BRIDGE_HOST || "127.0.0.1";
const port = Number.parseInt(process.env.MAC_SPEECH_BRIDGE_PORT || "8789", 10);
const swiftBin = process.env.SWIFT_BIN || "swift";
const allowedOrigins = new Set(
  (
    process.env.MAC_SPEECH_ALLOWED_ORIGINS ||
    "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174"
  )
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);
const helperPath = new URL("./mac-speech-helper.swift", import.meta.url);
const maxBodyBytes = 1024 * 1024;

const helper = spawn(swiftBin, [helperPath.pathname], {
  stdio: ["pipe", "pipe", "inherit"],
});
const helperOutput = createInterface({ input: helper.stdout });
let state = { status: "idle", id: null, error: null };

helperOutput.on("line", (line) => {
  try {
    const event = JSON.parse(line);
    if (
      event.event === "started" ||
      event.event === "accepted" ||
      event.event === "selection-started"
    ) {
      state = { status: "speaking", id: event.id ?? state.id, error: null };
    } else if (event.event === "selection-stopped") {
      state = { status: "idle", id: null, error: null };
    } else if (event.event === "paused") {
      state = { ...state, status: "paused", error: null };
    } else if (event.event === "resumed") {
      state = { ...state, status: "speaking", error: null };
    } else if (["finished", "cancelled", "stopped"].includes(event.event)) {
      state = { status: "idle", id: null, error: null };
    } else if (event.event === "error") {
      state = {
        status: "idle",
        id: null,
        error: event.message || "Mac音声ブリッジでエラーが発生しました",
      };
    }
  } catch {
    state = { status: "idle", id: null, error: "Mac音声ブリッジから不正な応答を受け取りました" };
  }
});

helper.on("exit", (code, signal) => {
  state = {
    status: "idle",
    id: null,
    error: `音声ヘルパーが終了しました (${code ?? "unknown"}/${signal ?? "no signal"})`,
  };
});

function json(res, status, body, origin) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  };
  if (origin) headers["Access-Control-Allow-Origin"] = origin;
  res.writeHead(status, headers);
  res.end(JSON.stringify(body));
}

function originFor(req) {
  const origin = req.headers.origin;
  if (!origin) return null;
  return allowedOrigins.has(origin) ? origin : undefined;
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBodyBytes) {
        reject(Object.assign(new Error("Request body is too large"), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(Object.assign(new Error("Request body must be valid JSON"), { statusCode: 400 }));
      }
    });
    req.on("error", reject);
  });
}

function send(command) {
  if (!helper.stdin.writable) throw new Error("Mac音声ヘルパーが起動していません");
  helper.stdin.write(`${JSON.stringify(command)}\n`);
}

const server = createServer(async (req, res) => {
  const origin = originFor(req);
  if (req.headers.origin && origin === undefined) {
    json(res, 403, { error: "Origin is not allowed" }, null);
    return;
  }

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": origin || "null",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "600",
    });
    res.end();
    return;
  }

  if (req.method === "GET" && req.url === "/healthz") {
    json(res, 200, { ok: true, provider: "macos-speak-selection", status: state.status }, origin);
    return;
  }

  if (req.method === "GET" && req.url === "/v1/speech/status") {
    json(res, 200, state, origin);
    return;
  }

  if (req.method !== "POST" || req.url !== "/v1/speech") {
    json(res, 404, { error: "Not found" }, origin);
    return;
  }

  let body;
  try {
    body = await readJson(req);
  } catch (error) {
    json(
      res,
      error?.statusCode || 400,
      { error: error instanceof Error ? error.message : "Invalid request" },
      origin,
    );
    return;
  }

  try {
    if (body.command === "speak") {
      if (typeof body.text !== "string" || !body.text.trim()) throw new Error("text is required");
      const id = crypto.randomUUID();
      send({
        id,
        command: "speak",
        text: body.text,
        language: typeof body.language === "string" ? body.language : "ja-JP",
        rate: typeof body.rate === "number" ? body.rate : 1,
      });
      state = { status: "speaking", id, error: null };
      json(res, 202, state, origin);
      return;
    }

    if (!["pause", "resume", "stop", "speak-selection", "stop-selection"].includes(body.command)) {
      throw new Error("unsupported speech command");
    }
    if (body.command === "speak-selection" || body.command === "stop-selection") {
      const id = crypto.randomUUID();
      send({ id, command: body.command });
      state =
        body.command === "speak-selection"
          ? { status: "speaking", id, error: null }
          : { status: "idle", id: null, error: null };
      json(res, 202, state, origin);
      return;
    }
    send({ id: state.id || crypto.randomUUID(), command: body.command });
    if (body.command === "pause") state = { ...state, status: "paused" };
    if (body.command === "resume") state = { ...state, status: "speaking" };
    if (body.command === "stop") state = { status: "idle", id: null, error: null };
    json(res, 200, state, origin);
  } catch (error) {
    state = {
      status: "idle",
      id: null,
      error: error instanceof Error ? error.message : "Speech request failed",
    };
    json(res, 503, { error: state.error }, origin);
  }
});

server.listen(port, host, () => {
  console.log(`Mac speech bridge listening on http://${host}:${port}`);
  console.log(`Allowed browser origins: ${[...allowedOrigins].join(", ")}`);
});

function shutdown() {
  helper.kill();
  server.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
