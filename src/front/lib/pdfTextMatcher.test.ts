import { describe, expect, it } from "vite-plus/test";
import { getSelectionFromTextLayer, snapSelectionToWordBoundaries } from "./pdfTextMatcher";

function textLayer(...parts: string[]): HTMLDivElement {
  const layer = document.createElement("div");
  layer.className = "textLayer";
  for (const [index, part] of parts.entries()) {
    const span = document.createElement("span");
    span.dataset.textItemIndex = String(index);
    span.dataset.pageNumber = "4";
    span.textContent = part;
    layer.append(span);
  }
  document.body.append(layer);
  return layer;
}

describe("snapSelectionToWordBoundaries", () => {
  it("expands a Latin selection to the words it touches", () => {
    const layer = textLayer("prefix selected suffix");
    const node = layer.querySelector("span")!.firstChild!;
    const range = document.createRange();
    range.setStart(node, 9);
    range.setEnd(node, 14);

    expect(snapSelectionToWordBoundaries(range).toString()).toBe("selected");
  });

  it("keeps a multi-line selection at complete word boundaries", () => {
    const layer = textLayer("first line ", "second line");
    const range = document.createRange();
    range.setStart(layer.querySelectorAll("span")[0].firstChild!, 3);
    range.setEnd(layer.querySelectorAll("span")[1].firstChild!, 6);

    expect(snapSelectionToWordBoundaries(range).toString()).toBe("first line second");
  });

  it("uses Unicode word segmentation for Japanese text", () => {
    const layer = textLayer("本文を読むための文章です");
    const node = layer.querySelector("span")!.firstChild!;
    const range = document.createRange();
    range.setStart(node, 3);
    range.setEnd(node, 4);

    expect(snapSelectionToWordBoundaries(range).toString()).toBe("読む");
  });

  it("does not include whitespace outside the selected words", () => {
    const layer = textLayer("before target after");
    const node = layer.querySelector("span")!.firstChild!;
    const range = document.createRange();
    range.setStart(node, 6);
    range.setEnd(node, 13);

    expect(snapSelectionToWordBoundaries(range).toString()).toBe("target");
  });
});

describe("getSelectionFromTextLayer", () => {
  it("reports the text-item span indices after a snapped selection crosses fragments", () => {
    const layer = textLayer("select", "ed text");
    const range = document.createRange();
    range.setStart(layer.querySelectorAll("span")[0].firstChild!, 3);
    range.setEnd(layer.querySelectorAll("span")[1].firstChild!, 5);

    const matched = getSelectionFromTextLayer(snapSelectionToWordBoundaries(range));

    expect(matched).toStrictEqual({
      text: "selected text",
      startIndex: 0,
      endIndex: 1,
      pageNumber: 4,
    });
  });
});
