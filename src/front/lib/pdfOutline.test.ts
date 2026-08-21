import { describe, it, expect } from "vite-plus/test";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { readOutlineEntries, toStoredOutline } from "./pdfOutline";

/**
 * A document whose bookmarks resolve the two ways pdf.js offers them: a named
 * destination it has to look up, and an explicit array carrying the page
 * reference itself. Page references stand in as their index, so `getPageIndex`
 * is the identity and a page comes back one higher.
 */
const BOOK_WITH_OUTLINE = {
  getOutline: () =>
    Promise.resolve([
      {
        title: "第1章 エッジで動かす",
        dest: "chapter-1",
        items: [{ title: "1.1 はじめに", dest: [2], items: [] }],
      },
      { title: "第2章 落ちない目次", dest: "nowhere", items: [] },
    ]),
  getDestination: (name: string) =>
    name === "chapter-1" ? Promise.resolve([1]) : Promise.resolve(null),
  getPageIndex: (ref: unknown) => Promise.resolve(ref as number),
} as unknown as PDFDocumentProxy;

describe("readOutlineEntries", () => {
  it("resolves bookmarks to pages, keeping chapters above their sections", async () => {
    expect(await readOutlineEntries(BOOK_WITH_OUTLINE)).toStrictEqual([
      {
        title: "第1章 エッジで動かす",
        pageNumber: 2,
        children: [{ title: "1.1 はじめに", pageNumber: 3, children: [] }],
      },
      // Listed without a page rather than taking the rest of the outline down
      // with it: a bookmark pointing at nothing still says where the reader is.
      { title: "第2章 落ちない目次", pageNumber: null, children: [] },
    ]);
  });

  it("reads a book that ships without bookmarks as having none", async () => {
    const noOutline = {
      getOutline: () => Promise.resolve(null),
    } as unknown as PDFDocumentProxy;

    expect(await readOutlineEntries(noOutline)).toStrictEqual([]);
  });
});

describe("toStoredOutline", () => {
  it("flattens to the top-level chapters the server cuts excerpts by", () => {
    expect(
      toStoredOutline([
        {
          title: "第1章",
          pageNumber: 2,
          children: [{ title: "1.1", pageNumber: 3, children: [] }],
        },
        { title: "第2章", pageNumber: 7, children: [] },
      ]),
    ).toStrictEqual([
      { title: "第1章", pageNumber: 2 },
      { title: "第2章", pageNumber: 7 },
    ]);
  });

  it("drops chapters whose destination never resolved to a page", () => {
    expect(
      toStoredOutline([
        { title: "第1章", pageNumber: 2, children: [] },
        { title: "宙に浮いた章", pageNumber: null, children: [] },
      ]),
    ).toStrictEqual([{ title: "第1章", pageNumber: 2 }]);
  });

  it("hands back null when no chapter carries a page, so nothing is stored", () => {
    expect(toStoredOutline([{ title: "宙に浮いた章", pageNumber: null, children: [] }])).toBeNull();
  });

  it("hands back null for a book without bookmarks", () => {
    expect(toStoredOutline([])).toBeNull();
  });

  // The server refuses an outline past its limits with a 400 on the whole
  // upload, and the outline is only decoration for chat — so an oversized one
  // is clamped here rather than costing the reader the book.

  it("shortens a chapter title to what the server accepts", () => {
    const entries = [{ title: "あ".repeat(501), pageNumber: 2, children: [] }];

    expect(toStoredOutline(entries)).toStrictEqual([{ title: "あ".repeat(500), pageNumber: 2 }]);
  });

  it("keeps only as many chapters as the server accepts, from the front", () => {
    const entries = Array.from({ length: 1001 }, (_, i) => ({
      title: `第${i + 1}章`,
      pageNumber: i + 1,
      children: [],
    }));

    const stored = toStoredOutline(entries);
    expect(stored?.length).toBe(1000);
    expect(stored?.[0]).toStrictEqual({ title: "第1章", pageNumber: 1 });
    expect(stored?.[999]).toStrictEqual({ title: "第1000章", pageNumber: 1000 });
  });
});
