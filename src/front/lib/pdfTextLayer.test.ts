import { describe, expect, it } from "vite-plus/test";
import { hasSelectablePdfText } from "./pdfTextLayer";

describe("hasSelectablePdfText", () => {
  it("accepts a page with real text items", () => {
    expect(hasSelectablePdfText([{ str: "本文" }])).toBe(true);
  });

  it("does not treat marked content or whitespace as selectable text", () => {
    expect(hasSelectablePdfText([{ type: "markedContent" }, { str: "   " }])).toBe(false);
  });

  it("handles an empty text-content response", () => {
    expect(hasSelectablePdfText([])).toBe(false);
  });
});
