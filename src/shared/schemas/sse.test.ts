import { describe, it, expect } from "vite-plus/test";
import { chatSseEventSchema } from "./sse";

describe("chatSseEventSchema", () => {
  // A characterization test: the server already puts its whole usage object on
  // the `done` event, so measuring anything new there reaches the client
  // whether or not the client asked for it. This pins down what happens then —
  // the reader keeps working and simply does not see the extra number.
  it("accepts a done event carrying a usage field the reader does not know, and drops it", () => {
    const parsed = chatSseEventSchema.safeParse({
      event: "done",
      data: {
        messageId: "01KZ",
        usage: { inputTokens: 11, outputTokens: 2, cachedInputTokens: 9 },
      },
    });

    expect(parsed.success).toBe(true);
    expect(parsed.data).toStrictEqual({
      event: "done",
      data: { messageId: "01KZ", usage: { inputTokens: 11, outputTokens: 2 } },
    });
  });
});
