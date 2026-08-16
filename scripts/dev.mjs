import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptsDir, "..");
const vpPath = path.join(repositoryRoot, "node_modules", ".bin", "vp");
const speechBridgePath = path.join(scriptsDir, "mac-speech-bridge.mjs");
const children = new Set();
let shuttingDown = false;

function start(command, args, label) {
  const child = spawn(command, args, {
    cwd: repositoryRoot,
    env: process.env,
    stdio: "inherit",
  });
  children.add(child);
  child.once("error", (error) => {
    console.error(`[${label}] ${error.message}`);
    if (label === "dev") void shutdown(1);
  });
  child.once("exit", (code, signal) => {
    children.delete(child);
    if (label === "dev" && !shuttingDown) {
      void shutdown(typeof code === "number" ? code : 1, signal);
    }
  });
  return child;
}

async function shutdown(exitCode = 0, signal = "") {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }
  if (signal) console.log(`\n開発サーバーが終了しました (${signal})`);
  await new Promise((resolve) => setTimeout(resolve, 100));
  process.exit(exitCode);
}

if (!existsSync(vpPath)) {
  console.error(
    "node_modules/.bin/vp が見つかりません。先に npm install または pnpm install を実行してください。",
  );
  process.exit(1);
}

if (process.platform === "darwin" && process.env.CHATBOOK_DISABLE_MAC_SPEECH !== "1") {
  console.log("Mac speech bridge を自動起動します");
  start(process.execPath, [speechBridgePath], "speech");
} else if (process.platform !== "darwin") {
  console.log("Mac speech bridge は macOS 以外では起動しません");
}

start(vpPath, ["dev", ...process.argv.slice(2)], "dev");

process.once("SIGINT", () => void shutdown(0, "SIGINT"));
process.once("SIGTERM", () => void shutdown(0, "SIGTERM"));
