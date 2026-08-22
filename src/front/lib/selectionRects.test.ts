import { describe, it, expect, afterEach } from "vite-plus/test";
import {
  tidySelectionRects,
  dropGuardRect,
  rangeWithinPage,
  alignSelectionRectsToPdfMetrics,
} from "./selectionRects";

describe("dropGuardRect", () => {
  const line = { x: 367, y: 219, width: 222, height: 16 };
  // While a drag is in progress the selection guard is stretched over the whole
  // page; a selection that swallows it gets the page as one more rect
  const guard = { x: 256, y: 63, width: 864, height: 1226 };

  it("drops the page-sized rect the guard contributes", () => {
    expect(dropGuardRect([line, guard], guard)).toStrictEqual([line]);
  });

  it("drops it despite the sub-pixel drift between two measurements", () => {
    const measuredAgain = { x: 255.6, y: 63.4, width: 864.3, height: 1226.4 };

    expect(dropGuardRect([line, measuredAgain], guard)).toStrictEqual([line]);
  });

  it("keeps a line that merely starts where the guard does", () => {
    const wideLine = { x: 256, y: 63, width: 864, height: 19 };

    expect(dropGuardRect([wideLine], guard)).toStrictEqual([wideLine]);
  });

  it("keeps every rect when there is no guard to compare against", () => {
    expect(dropGuardRect([line], null)).toStrictEqual([line]);
  });
});

describe("tidySelectionRects", () => {
  it("joins the pieces of a line, because the gaps between them are selected too", () => {
    // Shape measured from a real selection: pdf.js gives each phrase its own
    // span, so one line comes back as several rects with 30-40px gaps between
    // them, plus a near-duplicate that differs only in height
    const rects = [
      { x: 367, y: 219, width: 222, height: 16 },
      { x: 630, y: 220, width: 145, height: 16 },
      { x: 630, y: 220, width: 145, height: 15 },
      { x: 806, y: 220, width: 5, height: 16 },
      { x: 808, y: 219, width: 32, height: 16 },
    ];

    expect(tidySelectionRects(rects)).toStrictEqual([{ x: 367, y: 219, width: 473, height: 17 }]);
  });

  it("keeps the lines of a multi-line selection apart", () => {
    const rects = [
      { x: 367, y: 187, width: 574, height: 16 },
      { x: 367, y: 219, width: 222, height: 16 },
      { x: 630, y: 220, width: 145, height: 16 },
    ];

    expect(tidySelectionRects(rects)).toStrictEqual([
      { x: 367, y: 187, width: 574, height: 16 },
      { x: 367, y: 219, width: 408, height: 17 },
    ]);
  });

  it("ignores the zero-width caret rect that comes with a selection", () => {
    const rects = [
      { x: 256, y: 62, width: 0, height: 19 },
      { x: 367, y: 219, width: 222, height: 16 },
    ];

    expect(tidySelectionRects(rects)).toStrictEqual([{ x: 367, y: 219, width: 222, height: 16 }]);
  });

  it("returns nothing for a selection that has collapsed to a caret", () => {
    expect(tidySelectionRects([{ x: 5, y: 5, width: 0, height: 18 }])).toStrictEqual([]);
  });
});

describe("alignSelectionRectsToPdfMetrics", () => {
  it("reaches the painted end when the transparent text layer is narrower", () => {
    expect(
      alignSelectionRectsToPdfMetrics(
        [{ x: 40, y: 100, width: 230, height: 8 }],
        [{ rect: { x: 40, y: 100, width: 230, height: 8 }, pdfWidth: 258, fullySelected: true }],
      ),
    ).toStrictEqual([{ x: 40, y: 100, width: 258, height: 8 }]);
  });

  it("does not extend a partially selected final text item", () => {
    const rect = { x: 40, y: 100, width: 120, height: 8 };
    expect(
      alignSelectionRectsToPdfMetrics([rect], [{ rect, pdfWidth: 258, fullySelected: false }]),
    ).toStrictEqual([rect]);
  });

  it("shrinks to the painted end when the transparent text layer is wider", () => {
    expect(
      alignSelectionRectsToPdfMetrics(
        [{ x: 40, y: 100, width: 120, height: 8 }],
        [{ rect: { x: 40, y: 100, width: 120, height: 8 }, pdfWidth: 100, fullySelected: true }],
      ),
    ).toStrictEqual([{ x: 40, y: 100, width: 100, height: 8 }]);
  });

  it("does not bridge to an item on another line", () => {
    const rect = { x: 40, y: 100, width: 120, height: 8 };
    expect(
      alignSelectionRectsToPdfMetrics(
        [rect],
        [{ rect: { x: 40, y: 110, width: 120, height: 8 }, pdfWidth: 258, fullySelected: true }],
      ),
    ).toStrictEqual([rect]);
  });
});

describe("rangeWithinPage", () => {
  const LINES = {
    1: ["ページ1の1行目", "ページ1の2行目"],
    2: ["ページ2の1行目", "ページ2の2行目"],
  } as const;

  /** Two pages side by side, each holding a text layer of two lines. */
  function twoPagesUp() {
    const root = document.createElement("div");
    for (const page of [1, 2] as const) {
      const container = document.createElement("div");
      container.dataset.pageContainer = String(page);
      const textLayer = document.createElement("div");
      textLayer.className = "textLayer";
      for (const line of LINES[page]) {
        const span = document.createElement("span");
        span.textContent = line;
        textLayer.append(span);
      }
      container.append(textLayer);
      root.append(container);
    }
    document.body.append(root);

    const pageOf = (page: 1 | 2) =>
      root.querySelector<HTMLElement>(`[data-page-container="${page}"]`)!;
    const lineOf = (page: 1 | 2, line: 0 | 1) =>
      pageOf(page).querySelectorAll("span")[line].firstChild!;
    return { pageOf, lineOf };
  }

  afterEach(() => document.body.replaceChildren());

  it("leaves a range that already lies on the page as it is", () => {
    const { pageOf, lineOf } = twoPagesUp();
    const range = document.createRange();
    range.setStart(lineOf(1, 0), 0);
    range.setEnd(lineOf(1, 1), 4);

    expect(rangeWithinPage(range, pageOf(1)).toString()).toBe("ページ1の1行目ページ1");
  });

  it("cuts a range that runs on to the next page at the end of this one", () => {
    // Rectangles are stored in one page's pixels, so what is on the second page
    // has nowhere to go.
    const { pageOf, lineOf } = twoPagesUp();
    const range = document.createRange();
    range.setStart(lineOf(1, 1), 0);
    range.setEnd(lineOf(2, 0), 5);

    expect(rangeWithinPage(range, pageOf(1)).toString()).toBe("ページ1の2行目");
  });

  it("cuts a range that began on the page before at the start of this one", () => {
    // Which page is asked for comes from where the reader pressed down, so a
    // drag made right to left arrives here with its start on the other page.
    const { pageOf, lineOf } = twoPagesUp();
    const range = document.createRange();
    range.setStart(lineOf(1, 1), 0);
    range.setEnd(lineOf(2, 0), 5);

    expect(rangeWithinPage(range, pageOf(2)).toString()).toBe("ページ2の");
  });

  it("leaves the reader's own selection untouched while cutting a copy of it", () => {
    // The range handed in is the browser's; narrowing it in place would move
    // the selection the reader is still looking at.
    const { pageOf, lineOf } = twoPagesUp();
    const range = document.createRange();
    range.setStart(lineOf(1, 1), 0);
    range.setEnd(lineOf(2, 0), 5);

    rangeWithinPage(range, pageOf(1));

    expect(range.toString()).toBe("ページ1の2行目ページ2の");
  });

  it("gives up on a selection that has left the page's text, rather than taking the whole page", () => {
    // Focusing the question box moves the selection into it, and the box sits
    // inside the page. Cutting that range to the layer's own bounds answers
    // with every line on the page — an answer the viewer then stores as the
    // passage the reader chose and draws over the whole page.
    const { pageOf } = twoPagesUp();
    const questionBox = document.createElement("div");
    questionBox.textContent = "質問を入力";
    pageOf(1).append(questionBox);
    // Text of its own rather than a bare caret: a range that covers nothing
    // reads as no passage however it is cut, so a collapsed one here would
    // pass even against a version that does not cut at all.
    const range = document.createRange();
    range.setStart(questionBox.firstChild!, 0);
    range.setEnd(questionBox.firstChild!, 3);

    expect(rangeWithinPage(range, pageOf(1)).toString()).toBe("");
  });

  it("gives up on a selection made entirely on another page", () => {
    const { pageOf, lineOf } = twoPagesUp();
    const range = document.createRange();
    range.setStart(lineOf(2, 0), 0);
    range.setEnd(lineOf(2, 1), 4);

    expect(rangeWithinPage(range, pageOf(1)).toString()).toBe("");
  });

  it("gives up on a selection made entirely on the page before, asked about the page after", () => {
    // The mirror of the case above: which page is asked for comes from where
    // the reader pressed down, so either page can be the one with nothing on it.
    const { pageOf, lineOf } = twoPagesUp();
    const range = document.createRange();
    range.setStart(lineOf(1, 0), 0);
    range.setEnd(lineOf(1, 1), 4);

    expect(rangeWithinPage(range, pageOf(2)).toString()).toBe("");
  });

  it("leaves the range as it is on a page that has no text layer to cut against", () => {
    const { lineOf } = twoPagesUp();
    const blank = document.createElement("div");
    document.body.append(blank);
    const range = document.createRange();
    range.setStart(lineOf(1, 0), 0);
    range.setEnd(lineOf(1, 0), 5);

    expect(rangeWithinPage(range, blank).toString()).toBe("ページ1の");
  });
});
