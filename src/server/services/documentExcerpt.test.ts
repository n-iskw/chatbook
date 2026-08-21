import { describe, it, expect } from "vite-plus/test";
import { selectExcerpt, readStoredOutline, FALLBACK_WINDOW_PAGES } from "./documentExcerpt";

/** pdfLoader が作る fullText と同じ形 (ページ区切りは \f) */
function fullTextOf(...pages: string[]): string {
  return pages.join("\f");
}

/** n ページの本文を "p1" … "pn" で作る */
function bookOf(pageCount: number): string {
  return fullTextOf(...Array.from({ length: pageCount }, (_, i) => `p${i + 1}`));
}

/** startPage〜endPage をそのまま切った期待テキスト */
function pagesText(startPage: number, endPage: number): string {
  return Array.from({ length: endPage - startPage + 1 }, (_, i) => `p${startPage + i}`).join("\f");
}

describe("selectExcerpt", () => {
  const OUTLINE = [
    { title: "第1章", pageNumber: 2 },
    { title: "第2章", pageNumber: 5 },
    { title: "第3章", pageNumber: 9 },
  ];

  it("sends only the chapter that holds the highlighted page", () => {
    expect(selectExcerpt(bookOf(12), 6, OUTLINE)).toStrictEqual({
      text: pagesText(5, 8),
      startPage: 5,
      endPage: 8,
      totalPages: 12,
      isPartial: true,
    });
  });

  it("counts a chapter's opening page as part of that chapter, not the one before", () => {
    expect(selectExcerpt(bookOf(12), 5, OUTLINE)).toStrictEqual({
      text: pagesText(5, 8),
      startPage: 5,
      endPage: 8,
      totalPages: 12,
      isPartial: true,
    });
  });

  it("runs the last chapter to the final page of the book", () => {
    expect(selectExcerpt(bookOf(12), 10, OUTLINE)).toStrictEqual({
      text: pagesText(9, 12),
      startPage: 9,
      endPage: 12,
      totalPages: 12,
      isPartial: true,
    });
  });

  it("treats pages before the first chapter as front matter of their own", () => {
    expect(selectExcerpt(bookOf(12), 1, OUTLINE)).toStrictEqual({
      text: pagesText(1, 1),
      startPage: 1,
      endPage: 1,
      totalPages: 12,
      isPartial: true,
    });
  });

  it("hands back the whole book, marked whole, when its one chapter spans it", () => {
    expect(selectExcerpt(bookOf(3), 2, [{ title: "全部", pageNumber: 1 }])).toStrictEqual({
      text: pagesText(1, 3),
      startPage: 1,
      endPage: 3,
      totalPages: 3,
      isPartial: false,
    });
  });

  it("keeps the excerpt a verbatim slice of the full text", () => {
    const fullText = bookOf(12);

    // The excerpt must sit in the full text exactly where its first page does:
    // an empty excerpt (indexOf "" is 0) or one with anything injected into it
    // (indexOf -1) both land somewhere else.
    expect(fullText.indexOf(selectExcerpt(fullText, 6, OUTLINE).text)).toBe(fullText.indexOf("p5"));
  });

  it("keeps a chapter starting on page 1 whole, with no front matter split off it", () => {
    const outline = [
      { title: "第1章", pageNumber: 1 },
      { title: "第2章", pageNumber: 5 },
    ];

    expect(selectExcerpt(bookOf(12), 3, outline)).toStrictEqual({
      text: pagesText(1, 4),
      startPage: 1,
      endPage: 4,
      totalPages: 12,
      isPartial: true,
    });
  });

  it("orders an unsorted outline before cutting chapter bounds", () => {
    const shuffled = [OUTLINE[2], OUTLINE[0], OUTLINE[1]];

    expect(selectExcerpt(bookOf(12), 6, shuffled)).toStrictEqual({
      text: pagesText(5, 8),
      startPage: 5,
      endPage: 8,
      totalPages: 12,
      isPartial: true,
    });
  });

  it("lets the first of two chapters naming the same start page win", () => {
    const doubled = [
      { title: "第1章", pageNumber: 2 },
      { title: "第2章", pageNumber: 5 },
      { title: "第2章の重複", pageNumber: 5 },
      { title: "第3章", pageNumber: 9 },
    ];

    expect(selectExcerpt(bookOf(12), 5, doubled)).toStrictEqual({
      text: pagesText(5, 8),
      startPage: 5,
      endPage: 8,
      totalPages: 12,
      isPartial: true,
    });
  });

  it("ignores chapters pointing outside the book", () => {
    const stray = [...OUTLINE, { title: "落丁", pageNumber: 99 }];

    expect(selectExcerpt(bookOf(12), 10, stray)).toStrictEqual({
      text: pagesText(9, 12),
      startPage: 9,
      endPage: 12,
      totalPages: 12,
      isPartial: true,
    });
  });

  it("falls back to the page window when every chapter points outside the book", () => {
    const stray = [{ title: "落丁", pageNumber: 99 }];

    expect(selectExcerpt(bookOf(30), 15, stray)).toStrictEqual({
      text: pagesText(5, 25),
      startPage: 5,
      endPage: 25,
      totalPages: 30,
      isPartial: true,
    });
  });

  it("cuts a window around the highlight when the book has no outline", () => {
    expect(selectExcerpt(bookOf(30), 15, null)).toStrictEqual({
      text: pagesText(15 - FALLBACK_WINDOW_PAGES, 15 + FALLBACK_WINDOW_PAGES),
      startPage: 5,
      endPage: 25,
      totalPages: 30,
      isPartial: true,
    });
  });

  it("stops the window at the front cover rather than asking for page zero", () => {
    expect(selectExcerpt(bookOf(30), 2, null)).toStrictEqual({
      text: pagesText(1, 12),
      startPage: 1,
      endPage: 12,
      totalPages: 30,
      isPartial: true,
    });
  });

  it("stops the window at the back cover rather than past the book", () => {
    expect(selectExcerpt(bookOf(30), 29, null)).toStrictEqual({
      text: pagesText(19, 30),
      startPage: 19,
      endPage: 30,
      totalPages: 30,
      isPartial: true,
    });
  });

  it("hands back a window that covers a small book whole, marked whole", () => {
    expect(selectExcerpt(bookOf(12), 6, null)).toStrictEqual({
      text: pagesText(1, 12),
      startPage: 1,
      endPage: 12,
      totalPages: 12,
      isPartial: false,
    });
  });

  it("hands back a legacy text without page breaks whole", () => {
    expect(selectExcerpt("切れ目の無い 本文", 3, OUTLINE)).toStrictEqual({
      text: "切れ目の無い 本文",
      startPage: 1,
      endPage: 1,
      totalPages: 1,
      isPartial: false,
    });
  });

  it("pulls a highlight pointing past the book back to the last page", () => {
    expect(selectExcerpt(bookOf(12), 99, OUTLINE)).toStrictEqual({
      text: pagesText(9, 12),
      startPage: 9,
      endPage: 12,
      totalPages: 12,
      isPartial: true,
    });
  });
});

describe("readStoredOutline", () => {
  it("hands back the chapters a stored column holds", () => {
    expect(readStoredOutline('[{"title":"第1章","pageNumber":2}]')).toStrictEqual([
      { title: "第1章", pageNumber: 2 },
    ]);
  });

  it("reads a column stored as NULL as a book without an outline", () => {
    expect(readStoredOutline(null)).toBeNull();
  });

  it("reads a column that is not JSON as a book without an outline", () => {
    expect(readStoredOutline("{broken")).toBeNull();
  });

  it("reads JSON of the wrong shape as a book without an outline", () => {
    expect(readStoredOutline('[{"title":"章だけでページが無い"}]')).toBeNull();
  });
});
