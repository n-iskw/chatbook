import { describe, it, expect } from "vitest";
import { createSseParser } from "./sseParser";

describe("createSseParser", () => {
  it("pairs each event with the data line that follows it", () => {
    const parse = createSseParser();

    const events = parse(
      'event: token\ndata: {"content":"Hello"}\n\n' +
        'event: token\ndata: {"content":" world"}\n\n',
    );

    expect(events).toEqual([
      { event: "token", data: { content: "Hello" } },
      { event: "token", data: { content: " world" } },
    ]);
  });

  it("keeps distinct event types apart within one chunk", () => {
    const parse = createSseParser();

    const events = parse(
      'event: token\ndata: {"content":"hi"}\n\n' +
        'event: citation\ndata: {"id":"1","type":"pdf","text":"quoted"}\n\n' +
        'event: done\ndata: {"messageId":"abc"}\n\n',
    );

    expect(events).toEqual([
      { event: "token", data: { content: "hi" } },
      { event: "citation", data: { id: "1", type: "pdf", text: "quoted" } },
      { event: "done", data: { messageId: "abc" } },
    ]);
  });

  it("restores an event that was split across chunks", () => {
    const parse = createSseParser();

    expect(parse('event: token\ndata: {"cont')).toEqual([]);
    expect(parse('ent":"split"}\n\n')).toEqual([{ event: "token", data: { content: "split" } }]);
  });

  it("holds back an event until its terminating blank line arrives", () => {
    const parse = createSseParser();

    expect(parse('event: token\ndata: {"content":"pending"}\n')).toEqual([]);
    expect(parse("\n")).toEqual([{ event: "token", data: { content: "pending" } }]);
  });

  it("reports an error event with its payload", () => {
    const parse = createSseParser();

    expect(parse('event: error\ndata: {"code":"AI_API_ERROR","message":"boom"}\n\n')).toEqual([
      { event: "error", data: { code: "AI_API_ERROR", message: "boom" } },
    ]);
  });

  it("ignores empty chunks and blocks without data", () => {
    const parse = createSseParser();

    expect(parse("")).toEqual([]);
    expect(parse("\n\n")).toEqual([]);
    expect(parse("event: token\n\n")).toEqual([]);
  });

  it("skips a block whose data is not valid JSON instead of throwing", () => {
    const parse = createSseParser();

    expect(parse("event: token\ndata: not-json\n\n")).toEqual([]);
    expect(parse('event: token\ndata: {"content":"after"}\n\n')).toEqual([
      { event: "token", data: { content: "after" } },
    ]);
  });
});
