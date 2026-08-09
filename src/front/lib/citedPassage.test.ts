import { describe, it, expect, beforeEach, afterEach } from "vite-plus/test";
import { citedPassageOnPage, locateQuoteInSpans } from "./citedPassage";

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

  // The scan steps through the quote, so a passage the model reworded at the
  // front is still found by what follows it
  it("locates a later fragment of a quote whose opening the model rewrote", () => {
    const line = "ページ要素を原点として矩形を保存するとスクロールしてもずれない。";
    const reworded = `まえおきが十二文字ある。${line.slice(0, 24)}`;

    expect(locateQuoteInSpans([line], reworded)).toEqual({
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

/** A drawn page, with its text layer laid out the way pdf.js leaves it. */
function drawnPage(pageNumber: number, texts: string[]): HTMLElement {
  const page = document.createElement("div");
  const textLayer = document.createElement("div");
  textLayer.className = "textLayer";

  texts.forEach((text, index) => {
    const span = document.createElement("span");
    span.textContent = text;
    span.dataset.textItemIndex = String(index);
    span.dataset.pageNumber = String(pageNumber);
    textLayer.append(span);
  });

  page.append(textLayer);
  return page;
}

/**
 * Stands in for the layout jsdom does not do — it gives a `Range` no
 * `getClientRects` at all. The range reports where it was set instead: the
 * offsets it covers, on the row of the text item holding them, so a range
 * built over the wrong item or offsets reads back other numbers.
 */
function reportRangeBounds(this: Range): DOMRectList {
  const row = (node: Node) =>
    Number((node.parentElement as HTMLElement).dataset.textItemIndex) * 20;

  return [
    {
      left: this.startOffset,
      top: row(this.startContainer),
      width: this.endOffset - this.startOffset,
      height: 10,
    },
  ] as unknown as DOMRectList;
}

describe("citedPassageOnPage", () => {
  beforeEach(() => {
    Range.prototype.getClientRects = reportRangeBounds;
  });

  afterEach(() => {
    // jsdom had none to begin with, so removing the stand-in restores it
    Reflect.deleteProperty(Range.prototype, "getClientRects");
  });

  it("measures the quoted words where they sit in the page's text items", () => {
    const page = drawnPage(4, ["まえがき", "Workers はエッジで動きます。"]);

    // The second text item, from its 9th character to its 17th: the quote
    expect(citedPassageOnPage(page, { pageNumber: 4, text: "エッジで動きます" })).toEqual({
      rects: [{ x: 9, y: 20, width: 8, height: 10 }],
      // The page element reports no box in jsdom, so there is no width to
      // rescale the rects against later
      pageWidth: 0,
    });
  });

  // A page turn and the text layer for the page turned to do not land together
  it("measures nothing while the text layer still holds the page being left", () => {
    const leftBehind = drawnPage(3, ["Workers はエッジで動きます。"]);

    expect(citedPassageOnPage(leftBehind, { pageNumber: 4, text: "エッジで動きます" })).toBeNull();
  });
});
