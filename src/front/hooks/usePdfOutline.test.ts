import { describe, it, expect } from "vite-plus/test";
import { renderHook, waitFor } from "@testing-library/react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { usePdfOutline } from "./usePdfOutline";

/** A document whose bookmarks cannot be read, as a damaged file's cannot. */
const UNREADABLE_OUTLINE = {
  getOutline: () => Promise.reject(new Error("Invalid outline destination")),
} as unknown as PDFDocumentProxy;

/** A document that simply ships without a table of contents. */
const NO_OUTLINE = {
  getOutline: () => Promise.resolve(null),
} as unknown as PDFDocumentProxy;

/**
 * A document whose bookmarks resolve the two ways pdf.js offers them: a named
 * destination it has to look up, and an explicit array carrying the page
 * reference itself. Page references stand in as their index, so `getPageIndex`
 * is the identity and a page comes back one higher.
 *
 * A constant like the two above, and it has to be: the hook reads the document
 * once per identity, so one built inside the render would be a new document
 * every time and the read would never settle.
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

describe("usePdfOutline", () => {
  it("hands over the bookmarks with their pages, keeping chapters above their sections", async () => {
    const { result } = renderHook(() => usePdfOutline(BOOK_WITH_OUTLINE));

    await waitFor(() => expect(result.current.outline).not.toBeNull());
    expect(result.current.outline).toStrictEqual([
      {
        title: "第1章 エッジで動かす",
        pageNumber: 2,
        children: [{ title: "1.1 はじめに", pageNumber: 3, children: [] }],
      },
      // Listed without a page rather than taking the rest of the outline down
      // with it: a bookmark pointing at nothing still says where the reader is.
      { title: "第2章 落ちない目次", pageNumber: null, children: [] },
    ]);
    expect(result.current.error).toBeNull();
  });

  it("reports bookmarks that could not be read rather than passing them off as absent", async () => {
    // Both used to end as an empty list, so a book whose outline failed to load
    // looked exactly like a book that never had one.
    const { result } = renderHook(() => usePdfOutline(UNREADABLE_OUTLINE));

    await waitFor(() => expect(result.current.error).toBe("Invalid outline destination"));
    expect(result.current.outline).toBeNull();
  });

  it("reports a book that ships without bookmarks as having none", async () => {
    const { result } = renderHook(() => usePdfOutline(NO_OUTLINE));

    await waitFor(() => expect(result.current.outline).toStrictEqual([]));
    expect(result.current.error).toBeNull();
  });
});
