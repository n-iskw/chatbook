import { describe, it, expect, beforeAll } from "vite-plus/test";
import { env, applyD1Migrations, SELF } from "cloudflare:test";
import { http, HttpResponse } from "msw";
import { server } from "./setup/msw";
import { MINIMAL_PDF_BYTES } from "./fixtures/minimalPdf";

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

/** A book plus a highlighted passage, which is what a chat hangs off. */
async function createSelection(): Promise<{ pdfId: string; selectionId: string }> {
  const formData = new FormData();
  formData.append("file", new File([MINIMAL_PDF_BYTES], "chat.pdf", { type: "application/pdf" }));
  formData.append("fullText", "Durable Objects provide consistent state management.");
  formData.append("pageCount", "1");

  const uploadResponse = await SELF.fetch("https://example.com/api/pdf/open", {
    method: "POST",
    body: formData,
  });
  const { id: pdfId } = (await uploadResponse.json()) as { id: string };

  const selectionResponse = await SELF.fetch(`https://example.com/api/pdf/${pdfId}/selections`, {
    method: "POST",
    body: JSON.stringify({
      selectedText: "Durable Objects",
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
    const { pdfId, selectionId } = await createSelection();
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
    expect(events[2].data.usage).toEqual({ inputTokens: 11, outputTokens: 2 });
    expect(typeof events[2].data.messageId).toBe("string");
  });

  it("sends the highlighted passage as context and asks for web search when it is on", async () => {
    const { pdfId, selectionId } = await createSelection();
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
    expect(String(requestBody.instructions)).toContain("Durable Objects");

    expect(events.map((e) => e.event)).toEqual(["token", "token", "done"]);
    expect(events.slice(0, 2).map((e) => e.data)).toEqual([
      { content: "Workers " },
      { content: "run everywhere" },
    ]);
  });

  it("reports an upstream failure to the client as an error event", async () => {
    const { pdfId, selectionId } = await createSelection();

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
    expect(events[0].data.code).toBe("AI_API_ERROR");
  });
});
