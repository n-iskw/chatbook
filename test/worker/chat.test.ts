import { describe, it, expect, beforeAll } from "vite-plus/test";
import { env, applyD1Migrations, SELF } from "cloudflare:test";
import { http, HttpResponse } from "msw";
import { server } from "./setup/msw";
import { MINIMAL_PDF_BYTES } from "./fixtures/minimalPdf";

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

/** The book's text. The highlighted passage is deliberately absent from it, so
 * a prompt that drops the selection cannot pass by quoting the book instead. */
const BOOK_TEXT = "Workers run on Cloudflare's global network.";
const HIGHLIGHTED_PASSAGE = "Durable Objects";

/**
 * A book plus a highlighted passage, which is what a chat hangs off.
 *
 * Books are de-duplicated by content hash and D1 is only isolated per test
 * file, so each test appends its own PDF comment to get a book of its own.
 */
async function createSelection(tag: string): Promise<{ pdfId: string; selectionId: string }> {
  const suffix = new TextEncoder().encode(`\n%${tag}\n`);
  const bytes = new Uint8Array(MINIMAL_PDF_BYTES.length + suffix.length);
  bytes.set(MINIMAL_PDF_BYTES, 0);
  bytes.set(suffix, MINIMAL_PDF_BYTES.length);

  const formData = new FormData();
  formData.append("file", new File([bytes], `${tag}.pdf`, { type: "application/pdf" }));
  formData.append("fullText", BOOK_TEXT);
  formData.append("pageCount", "1");

  const uploadResponse = await SELF.fetch("https://example.com/api/pdf/open", {
    method: "POST",
    body: formData,
  });
  const { id: pdfId } = (await uploadResponse.json()) as { id: string };

  const selectionResponse = await SELF.fetch(`https://example.com/api/pdf/${pdfId}/selections`, {
    method: "POST",
    body: JSON.stringify({
      selectedText: HIGHLIGHTED_PASSAGE,
      pageNumber: 1,
      positionData: { startIndex: 0, endIndex: 1, rects: [] },
    }),
  });
  const { id: selectionId } = (await selectionResponse.json()) as { id: string };

  return { pdfId, selectionId };
}

/** An SSE body shaped like the chat completions stream, ending in [DONE]. */
function chatCompletionsSse(tokens: string[]): string {
  const chunks = tokens.map(
    (token) => `data: ${JSON.stringify({ choices: [{ delta: { content: token } }] })}`,
  );
  chunks.push(
    `data: ${JSON.stringify({
      choices: [{ delta: {} }],
      usage: { prompt_tokens: 11, completion_tokens: 2 },
    })}`,
    "data: [DONE]",
  );
  return `${chunks.join("\n\n")}\n\n`;
}

/** An SSE body shaped like the responses API stream used for web search. */
function responsesSse(tokens: string[]): string {
  const chunks = tokens.map(
    (token) => `data: ${JSON.stringify({ type: "response.output_text.delta", delta: token })}`,
  );
  chunks.push(
    `data: ${JSON.stringify({
      type: "response.completed",
      usage: { input_tokens: 11, output_tokens: 2 },
    })}`,
  );
  return `${chunks.join("\n\n")}\n\n`;
}

interface SseEvent {
  event: string;
  data: Record<string, unknown>;
}

/** Parse the endpoint's SSE response into the events a client would see. */
function parseSse(body: string): SseEvent[] {
  return body
    .split("\n\n")
    .filter((block) => block.trim() !== "")
    .map((block) => {
      const event = block.match(/^event: (.+)$/m)?.[1] ?? "";
      const data = block.match(/^data: (.+)$/m)?.[1] ?? "{}";
      return { event, data: JSON.parse(data) as Record<string, unknown> };
    });
}

/** The passage the system prompt hands the model as the user's highlight. */
function highlightedPassageIn(instructions: string): string | undefined {
  return instructions.match(
    /--- HIGHLIGHTED PASSAGE ---\n([\s\S]*?)\n--- END HIGHLIGHTED PASSAGE ---/,
  )?.[1];
}

async function postChat(
  pdfId: string,
  selectionId: string,
  payload: { content: string; useWebSearch: boolean },
): Promise<Response> {
  return SELF.fetch(`https://example.com/api/pdf/${pdfId}/selections/${selectionId}/chats`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

describe("POST /api/pdf/:pdfId/selections/:selId/chats", () => {
  it("streams tokens from the chat completions endpoint as SSE when web search is off", async () => {
    const { pdfId, selectionId } = await createSelection("chat-stream");
    const calledUrls: string[] = [];

    server.use(
      http.post("https://api.deepseek.com/chat/completions", ({ request }) => {
        calledUrls.push(request.url);
        return new HttpResponse(chatCompletionsSse(["Durable ", "Objects"]), {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        });
      }),
    );

    const response = await postChat(pdfId, selectionId, {
      content: "What are Durable Objects?",
      useWebSearch: false,
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/event-stream");

    // The upstream handler only runs to completion once the SSE stream is
    // drained, so read the body before asserting on what it captured.
    const events = parseSse(await response.text());

    expect(calledUrls).toEqual(["https://api.deepseek.com/chat/completions"]);
    expect(events.map((e) => e.event)).toEqual(["token", "token", "done"]);
    expect(events.slice(0, 2).map((e) => e.data)).toEqual([
      { content: "Durable " },
      { content: "Objects" },
    ]);
    expect(events[2].data).toEqual({
      messageId: expect.any(String),
      usage: { inputTokens: 11, outputTokens: 2 },
    });
  });

  it("sends the highlighted passage as context and asks for web search when it is on", async () => {
    const { pdfId, selectionId } = await createSelection("chat-websearch");
    let requestBody: Record<string, unknown> = {};

    server.use(
      http.post("https://api.deepseek.com/responses", async ({ request }) => {
        requestBody = (await request.json()) as Record<string, unknown>;
        return new HttpResponse(responsesSse(["Workers ", "run everywhere"]), {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        });
      }),
    );

    const response = await postChat(pdfId, selectionId, {
      content: "Where do Workers run?",
      useWebSearch: true,
    });

    expect(response.status).toBe(200);

    const events = parseSse(await response.text());

    expect(requestBody.tools).toEqual([{ type: "web_search" }]);
    expect(requestBody.input).toEqual([
      { type: "message", role: "user", content: "Where do Workers run?" },
    ]);
    expect(highlightedPassageIn(String(requestBody.instructions))).toBe(HIGHLIGHTED_PASSAGE);

    expect(events.map((e) => e.event)).toEqual(["token", "token", "done"]);
    expect(events.slice(0, 2).map((e) => e.data)).toEqual([
      { content: "Workers " },
      { content: "run everywhere" },
    ]);
  });

  it("reports an upstream failure to the client as an error event", async () => {
    const { pdfId, selectionId } = await createSelection("chat-upstream-error");

    server.use(
      http.post(
        "https://api.deepseek.com/chat/completions",
        () => new HttpResponse("upstream is down", { status: 503 }),
      ),
    );

    const response = await postChat(pdfId, selectionId, {
      content: "What are Durable Objects?",
      useWebSearch: false,
    });

    expect(response.status).toBe(200);
    const events = parseSse(await response.text());
    expect(events.map((e) => e.event)).toEqual(["error"]);
    expect(events[0].data).toEqual({ code: "AI_API_ERROR", message: expect.any(String) });
  });
});
