import { describe, it, expect } from "vite-plus/test";
import { locateQuoteInSpans } from "./citedPassage";

describe("locateQuoteInSpans", () => {
  it("locates a quote that sits inside a single text item", () => {
    expect(
      locateQuoteInSpans(["まえがき", "Workers はエッジで動きます。"], "エッジで動きます"),
    ).toEqual({ startSpan: 1, startOffset: 9, endSpan: 1, endOffset: 17 });
  });

  // pdf.js cuts a line into one item per phrase, so a quoted sentence almost
  // never lines up with a single one of them
  it("locates a quote that runs from one text item into the next", () => {
    expect(
      locateQuoteInSpans(["Workers は", "エッジで", "動きます。"], "エッジで動きます"),
    ).toEqual({
      startSpan: 1,
      startOffset: 0,
      endSpan: 2,
      endOffset: 4,
    });
  });

  // The model quotes the passage as it reads; the extractor joins text items
  // with spaces. Neither side's whitespace is the other's.
  it("locates a quote whose spacing differs from the page's", () => {
    expect(locateQuoteInSpans(["Cloudflare   Workers  runs"], "Cloudflare Workers")).toEqual({
      startSpan: 0,
      startOffset: 0,
      endSpan: 0,
      endOffset: 20,
    });
  });

  // The same fallback the server uses to find the page in the first place: a
  // quote reworded at the end still starts where the passage starts
  it("locates the opening fragment of a quote the model did not reproduce word for word", () => {
    const page = ["ハイライトの座標はページ要素を原点として保存する。", "その理由は明快である。"];
    const reworded = "ハイライトの座標はページ要素を原点として保存するのが望ましいと考えられる";

    expect(locateQuoteInSpans(page, reworded)).toEqual({
      startSpan: 0,
      startOffset: 0,
      endSpan: 0,
      endOffset: 24,
    });
  });

  it("returns null for a quote the page does not hold", () => {
    expect(
      locateQuoteInSpans(["まえがき", "Workers はエッジで動きます。"], "本文に無い引用"),
    ).toBeNull();
  });

  it("returns null for a source that carries no quote at all", () => {
    expect(locateQuoteInSpans(["まえがき"], "  ")).toBeNull();
  });
});
