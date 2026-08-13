import { describe, it, expect } from "vite-plus/test";
import { buildSystemPrompt, streamResponseWithWebSearch } from "./deepseekService";

/** A Responses API answer made of the given SSE lines, served to the injected fetch. */
function respondingWith(lines: string[]): typeof fetch {
  return () =>
    Promise.resolve(
      new Response(new TextEncoder().encode(lines.map((line) => `${line}\n\n`).join("")), {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      }),
    );
}

function sseData(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}`;
}

/** Run the web-search stream against a canned body and collect what it reported. */
async function readWebSearchStream(lines: string[]) {
  const tokens: string[] = [];
  const errors: string[] = [];
  let usage: unknown = null;

  await streamResponseWithWebSearch(
    "test-key",
    "system prompt",
    [{ role: "user", content: "Where do Workers run?" }],
    {
      onToken: (token) => tokens.push(token),
      onDone: (reported) => {
        usage = reported;
      },
      onError: (err) => errors.push(err.message),
    },
    undefined,
    respondingWith(lines),
  );

  return { tokens, errors, usage };
}

describe("streamResponseWithWebSearch", () => {
  it("delivers the text deltas and the token counts when the stream completes normally", async () => {
    const { tokens, errors, usage } = await readWebSearchStream([
      sseData({ type: "response.output_text.delta", delta: "Workers " }),
      sseData({ type: "response.output_text.delta", delta: "run everywhere" }),
      sseData({
        type: "response.completed",
        response: { usage: { input_tokens: 11, output_tokens: 2 } },
      }),
    ]);

    expect(tokens).toStrictEqual(["Workers ", "run everywhere"]);
    expect(usage).toStrictEqual({ inputTokens: 11, outputTokens: 2, cachedInputTokens: 0 });
    expect(errors).toStrictEqual([]);
  });

  it("reports how much of the input was served from the prompt cache when the stream says so", async () => {
    // The whole book rides in front of every question, so what the cache
    // covered is the difference between paying full price for it and 1/50th.
    const { usage } = await readWebSearchStream([
      sseData({ type: "response.output_text.delta", delta: "Workers run everywhere" }),
      sseData({
        type: "response.completed",
        response: {
          usage: {
            input_tokens: 11,
            output_tokens: 2,
            input_tokens_details: { cached_tokens: 9 },
          },
        },
      }),
    ]);

    expect(usage).toStrictEqual({ inputTokens: 11, outputTokens: 2, cachedInputTokens: 9 });
  });

  it("skips a delta that is not text instead of writing it into the answer", async () => {
    // A non-string delta used to be concatenated as "[object Object]" and saved
    // to D1 as part of the answer.
    const { tokens, errors, usage } = await readWebSearchStream([
      sseData({ type: "response.output_text.delta", delta: { annotation: "web" } }),
      sseData({ type: "response.output_text.delta", delta: "Workers run everywhere" }),
      sseData({ type: "response.output_text.delta", delta: 42 }),
      sseData({
        type: "response.completed",
        response: { usage: { input_tokens: 11, output_tokens: 2 } },
      }),
    ]);

    expect(tokens).toStrictEqual(["Workers run everywhere"]);
    expect(usage).toStrictEqual({ inputTokens: 11, outputTokens: 2, cachedInputTokens: 0 });
    // Silently skipped, not reported: a delta the reader has no use for is not
    // a failure to show in the chat
    expect(errors).toStrictEqual([]);
  });

  it("keeps reading the answer past an event of a type it does not know", async () => {
    const { tokens, errors, usage } = await readWebSearchStream([
      sseData({ type: "response.web_search_call.in_progress" }),
      sseData({ type: "response.output_text.delta", delta: "Workers run everywhere" }),
      sseData({
        type: "response.completed",
        response: { usage: { input_tokens: 11, output_tokens: 2 } },
      }),
    ]);

    expect(tokens).toStrictEqual(["Workers run everywhere"]);
    expect(usage).toStrictEqual({ inputTokens: 11, outputTokens: 2, cachedInputTokens: 0 });
    expect(errors).toStrictEqual([]);
  });

  it("keeps reading the answer past a line that is not JSON at all", async () => {
    const { tokens, errors, usage } = await readWebSearchStream([
      sseData({ type: "response.output_text.delta", delta: "Workers run everywhere" }),
      "data: {not json",
      sseData({
        type: "response.completed",
        response: { usage: { input_tokens: 11, output_tokens: 2 } },
      }),
    ]);

    expect(tokens).toStrictEqual(["Workers run everywhere"]);
    expect(usage).toStrictEqual({ inputTokens: 11, outputTokens: 2, cachedInputTokens: 0 });
    expect(errors).toStrictEqual([]);
  });

  it("reports a refusal from the model's own API rather than finishing on an empty answer", async () => {
    // The route turns this into the `error` event the chat panel shows. Ending
    // instead through `onDone` would save an empty answer as if it were one.
    const tokens: string[] = [];
    const errors: string[] = [];
    let completions = 0;

    await streamResponseWithWebSearch(
      "test-key",
      "system prompt",
      [{ role: "user", content: "Where do Workers run?" }],
      {
        onToken: (token) => tokens.push(token),
        onDone: () => {
          completions += 1;
        },
        onError: (err) => errors.push(err.message),
      },
      undefined,
      () => Promise.resolve(new Response("upstream is down", { status: 503 })),
    );

    expect(errors).toStrictEqual(["Responses API error 503: upstream is down"]);
    expect(tokens).toStrictEqual([]);
    expect(completions).toBe(0);
  });

  it("finishes an answer that stopped before it said what it cost, rather than losing it", async () => {
    // A stream cut short still carries an answer the reader has already been
    // shown, so it is completed with nothing counted instead of thrown away.
    const { tokens, errors, usage } = await readWebSearchStream([
      sseData({ type: "response.output_text.delta", delta: "Workers run everywhere" }),
    ]);

    expect(tokens).toStrictEqual(["Workers run everywhere"]);
    expect(usage).toStrictEqual({ inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 });
    expect(errors).toStrictEqual([]);
  });
});

const BOOK = "Workers execute on Cloudflare's global network.";
const PASSAGE = "global network";

/** What the prompt hands the model between a pair of its markers. */
function between(prompt: string, start: string, end: string): string {
  return prompt.slice(prompt.indexOf(start) + start.length, prompt.indexOf(end)).trim();
}

/** The two fixed lines the web-search instruction sits between. */
const TABLE_RULE = "- For tabular comparisons, use a markdown table, not a diagram.";
const CITATION_RULES = "When answering, follow these citation rules strictly:";

describe("buildSystemPrompt", () => {
  it("puts the book and the highlighted passage where it tells the model to look for them", () => {
    // Read back through the markers the prompt names rather than the whole
    // text: those markers are what the model is told to read between, so they
    // are the contract, while the wording around them is tuned freely.
    const prompt = buildSystemPrompt(BOOK, PASSAGE, true);

    expect(between(prompt, "--- DOCUMENT START ---", "--- DOCUMENT END ---")).toBe(BOOK);
    expect(between(prompt, "--- HIGHLIGHTED PASSAGE ---", "--- END HIGHLIGHTED PASSAGE ---")).toBe(
      PASSAGE,
    );
  });

  it("shuts the model in with the document when the reader turns web search off", () => {
    const off = buildSystemPrompt(BOOK, PASSAGE, false);

    expect(between(off, TABLE_RULE, CITATION_RULES)).toBe(
      "Respond using only the document context. If the document does not contain the answer, say so clearly.",
    );
    // And the rest of the prompt is the same one: an instruction that went
    // missing rather than being swapped would leave this to fail too.
    expect(off).toBe(
      buildSystemPrompt(BOOK, PASSAGE, true).replace(
        "When the document does not contain enough information to answer the question, you may use web search to find additional context. Always indicate when you are using external sources.",
        "Respond using only the document context. If the document does not contain the answer, say so clearly.",
      ),
    );
  });

  it("lets the model reach for the web when the reader leaves search on", () => {
    expect(between(buildSystemPrompt(BOOK, PASSAGE, true), TABLE_RULE, CITATION_RULES)).toBe(
      "When the document does not contain enough information to answer the question, you may use web search to find additional context. Always indicate when you are using external sources.",
    );
  });
});
