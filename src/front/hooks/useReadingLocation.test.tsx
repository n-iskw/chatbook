import { describe, it, expect, vi } from "vite-plus/test";
import { renderHook, act, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { Provider, createStore, useSetAtom } from "jotai";
import type { ReactNode } from "react";
import { useReadingLocation, type LocatePassage } from "./useReadingLocation";
import { currentPageAtom, outlineOpenAtom } from "../atoms/pdfAtom";
import { activeSelectionAtom, chatPanelOpenAtom, type ActiveSelection } from "../atoms/chatAtom";
import { SwrTestCache } from "../../test/swrTestCache";
import { setViewportWidth, PHONE_WIDTH } from "../../test/viewport";
import type { BookDetail, ReadingState } from "../../shared/schemas/book";
import type { SelectionHighlight } from "../../shared/schemas/selection";

const PDF_ID = "01JBOOK";

/** The answer for a passage the book does not hold. */
const MISSING = { found: false, miss: "not-in-book" } as const;

const A_PASSAGE = "エッジは速い";

function highlight(id: string, selectedText: string, pageNumber: number): SelectionHighlight {
  return {
    id,
    selectedText,
    pageNumber,
    positionData: { rects: [] },
    color: "#FFEB3B",
    createdAt: "2026-08-01T10:00:00.000Z",
  };
}

const BOOK: BookDetail = {
  id: PDF_ID,
  fileName: "Cloudflare Workers.pdf",
  pageCount: 209,
  hasThumbnail: true,
  selections: [highlight("a1", A_PASSAGE, 12), highlight("a2", "V8 isolate", 30)],
  readingState: null,
};

/** The same book, plus the place another device left off at. */
function bookLeftAt(readingState: ReadingState): BookDetail {
  return { ...BOOK, readingState };
}

/** The whole query string, named, so a test states every parameter it expects. */
function paramsOf(search: string): Record<string, string> {
  const named: Record<string, string> = {};
  new URLSearchParams(search).forEach((value, key) => {
    named[key] = value;
  });
  return named;
}

const pageOf = (search: string) => new URLSearchParams(search).get("page");

/** Exposes the URL the hook drives and a way to turn pages like the viewer does. */
function useHarness(
  locatePassage: LocatePassage,
  linkedPassage: string | null,
  visited: string[],
  book: BookDetail | undefined,
  openChat: (selection: ActiveSelection) => void,
) {
  const { passageMiss, locationReady } = useReadingLocation(
    PDF_ID,
    locatePassage,
    linkedPassage,
    book,
    openChat,
  );

  const { search } = useLocation();
  if (visited[visited.length - 1] !== search) visited.push(search);

  return {
    search,
    passageMiss,
    locationReady,
    setCurrentPage: useSetAtom(currentPageAtom),
    setOutlineOpen: useSetAtom(outlineOpenAtom),
    setChatPanelOpen: useSetAtom(chatPanelOpenAtom),
    setActiveSelection: useSetAtom(activeSelectionAtom),
  };
}

function renderAt(
  url: string,
  options: {
    locatePassage?: LocatePassage;
    linkedPassage?: string | null;
    book?: BookDetail;
  } = {},
) {
  const { locatePassage = async () => MISSING, linkedPassage = null, book } = options;
  const store = createStore();
  // Every distinct URL the hook drives, in order, so tests can tell "landed on
  // page 20" apart from "bounced through page 1 first"
  const visited: string[] = [];
  const wrapper = ({ children }: { children: ReactNode }) => (
    <SwrTestCache>
      <Provider store={store}>
        <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>
      </Provider>
    </SwrTestCache>
  );
  // Stands in for the reader's own opener: the chat it puts on screen is the
  // active selection, which is also what keeps the id in the URL afterwards.
  const openChat = vi.fn((selection: ActiveSelection) => store.set(activeSelectionAtom, selection));

  return {
    store,
    visited,
    openChat,
    view: renderHook(
      ({ book }: { book: BookDetail | undefined }) =>
        useHarness(locatePassage, linkedPassage, visited, book, openChat),
      { wrapper, initialProps: { book } },
    ),
  };
}

describe("useReadingLocation", () => {
  it("opens the page named in the URL so a reload resumes where the reader left off", () => {
    const { store } = renderAt(`/books/${PDF_ID}?page=42`);

    expect(store.get(currentPageAtom)).toBe(42);
  });

  it("writes the page into the URL when the reader turns to it", async () => {
    const { store, view } = renderAt(`/books/${PDF_ID}?page=1`);

    act(() => view.result.current.setCurrentPage(7));

    await waitFor(() => expect(paramsOf(view.result.current.search)).toStrictEqual({ page: "7" }));
    expect(store.get(currentPageAtom)).toBe(7);
  });

  it("stays on the page it was given instead of bouncing back to the first one", async () => {
    const { store, visited, view } = renderAt(`/books/${PDF_ID}?page=20`);

    await waitFor(() => expect(paramsOf(view.result.current.search)).toStrictEqual({ page: "20" }));

    // Sweeping the old parameters out takes another replace, but page 20 is the
    // only page any of them names
    expect(new Set(visited.map(pageOf))).toStrictEqual(new Set(["20"]));
    expect(store.get(currentPageAtom)).toBe(20);
  });

  it("leaves the panels out of the URL, so folding one is not a page to go back to", async () => {
    const { view } = renderAt(`/books/${PDF_ID}`, { book: BOOK });

    act(() => {
      view.result.current.setChatPanelOpen(false);
      view.result.current.setOutlineOpen(false);
    });

    await waitFor(() => expect(paramsOf(view.result.current.search)).toStrictEqual({ page: "1" }));
  });

  it("drops the panel parameters an older link still carries", async () => {
    // Written back when the address bar held them. The URL no longer decides
    // either panel, so what it says about them is swept up rather than obeyed.
    const { store, view } = renderAt(`/books/${PDF_ID}?page=5&panel=closed&outline=closed`, {
      book: BOOK,
    });

    await waitFor(() => expect(paramsOf(view.result.current.search)).toStrictEqual({ page: "5" }));
    expect(store.get(chatPanelOpenAtom)).toBe(true);
    expect(store.get(outlineOpenAtom)).toBe(true);
  });

  it("sweeps a retired parameter out even when the link names no place at all", async () => {
    // Nothing here says where to open, so the place waits for the book — but
    // the stale parameter is swept at once rather than being left in the
    // address bar for as long as the fetch takes, or forever if it fails.
    const { view } = renderAt(`/books/${PDF_ID}?outline=closed`);

    await waitFor(() => expect(paramsOf(view.result.current.search)).toStrictEqual({}));
  });

  it("reopens the chat the URL names once the book it belongs to is in hand", async () => {
    const { store, openChat } = renderAt(`/books/${PDF_ID}?page=5&selection=a1`, { book: BOOK });

    await waitFor(() => expect(openChat).toHaveBeenCalledTimes(1));
    expect(openChat).toHaveBeenCalledWith({
      id: "a1",
      selectedText: A_PASSAGE,
      pageNumber: 12,
    });
    // The URL's page wins over the highlight's own: it is where the reader was
    expect(store.get(currentPageAtom)).toBe(5);
  });

  it("waits for the book rather than deciding the chat is gone", async () => {
    const { openChat, view } = renderAt(`/books/${PDF_ID}?selection=a1`);

    // Highlights are read out of the book, so until it lands there is nothing
    // to look the id up in
    await waitFor(() =>
      expect(paramsOf(view.result.current.search)).toStrictEqual({
        page: "1",
        selection: "a1",
      }),
    );
    expect(openChat).toHaveBeenCalledTimes(0);

    await act(async () => view.rerender({ book: BOOK }));

    expect(openChat).toHaveBeenCalledTimes(1);
  });

  it("keeps the chat named in the URL through a page turn taken before the book lands", async () => {
    const { openChat, view } = renderAt(`/books/${PDF_ID}?page=5&selection=a1`);

    act(() => view.result.current.setCurrentPage(9));

    await waitFor(() =>
      expect(paramsOf(view.result.current.search)).toStrictEqual({
        page: "9",
        selection: "a1",
      }),
    );

    await act(async () => view.rerender({ book: BOOK }));
    expect(openChat).toHaveBeenCalledTimes(1);
  });

  it("shows the highlight list for a chat the book no longer has, and stops saying otherwise", async () => {
    const { openChat, view } = renderAt(`/books/${PDF_ID}?page=5&selection=deleted`, {
      book: BOOK,
    });

    await waitFor(() =>
      expect(paramsOf(view.result.current.search)).toStrictEqual({
        page: "5",
      }),
    );
    expect(openChat).toHaveBeenCalledTimes(0);
  });

  it("writes the open chat into the URL, and drops it on the way back to the list", async () => {
    const { view } = renderAt(`/books/${PDF_ID}?page=12`, { book: BOOK });

    act(() =>
      view.result.current.setActiveSelection({
        id: "a2",
        selectedText: "V8 isolate",
        pageNumber: 30,
      }),
    );
    await waitFor(() =>
      expect(paramsOf(view.result.current.search)).toStrictEqual({
        page: "12",
        selection: "a2",
      }),
    );

    act(() => view.result.current.setActiveSelection(null));

    await waitFor(() =>
      expect(paramsOf(view.result.current.search)).toStrictEqual({
        page: "12",
      }),
    );
  });

  it("carries the page and the chat opened in the same breath into one URL", async () => {
    // Picking a highlight off the list moves both at once, and a writer that
    // handled them apart would leave the URL holding only the later one.
    const { view } = renderAt(`/books/${PDF_ID}?page=1`, { book: BOOK });

    act(() => {
      view.result.current.setCurrentPage(30);
      view.result.current.setActiveSelection({
        id: "a2",
        selectedText: "V8 isolate",
        pageNumber: 30,
      });
    });

    await waitFor(() =>
      expect(paramsOf(view.result.current.search)).toStrictEqual({
        page: "30",
        selection: "a2",
      }),
    );
  });

  it("opens the page holding the passage of a browser text-fragment link", async () => {
    const { store } = renderAt(`/books/${PDF_ID}`, {
      linkedPassage: "エッジは速い",
      locatePassage: async (_pdfId, passage) =>
        passage === "エッジは速い" ? { found: true, pageNumber: 88 } : MISSING,
    });

    await waitFor(() => expect(store.get(currentPageAtom)).toBe(88));
  });

  it("prefers the linked passage over the page the URL names", async () => {
    // A shared "link to highlight" points at a passage; the ?page= it carries
    // is only where the sender happened to be
    const { store } = renderAt(`/books/${PDF_ID}?page=5`, {
      linkedPassage: "エッジは速い",
      locatePassage: async () => ({ found: true, pageNumber: 88 }),
    });

    await waitFor(() => expect(store.get(currentPageAtom)).toBe(88));
  });

  it("stays on the first page when the linked passage is not found in the book", async () => {
    const { store, view } = renderAt(`/books/${PDF_ID}`, {
      linkedPassage: "missing",
      locatePassage: async () => MISSING,
    });

    await waitFor(() => expect(view.result.current.passageMiss).toBe("not-in-book"));
    expect(paramsOf(view.result.current.search)).toStrictEqual({ page: "1" });
    expect(store.get(currentPageAtom)).toBe(1);
  });

  it("tells a lookup that never answered apart from one that searched and found nothing", async () => {
    // Both leave the reader on page 1, but only one of them says anything
    // about whether the quote is the book's own words.
    const { view } = renderAt(`/books/${PDF_ID}`, {
      linkedPassage: "エッジは速い",
      locatePassage: async () => {
        throw new Error("PDF not found");
      },
    });

    await waitFor(() => expect(view.result.current.passageMiss).toBe("lookup-failed"));
  });

  it("passes on a book of one page as its own reason rather than a missing passage", async () => {
    const { view } = renderAt(`/books/${PDF_ID}`, {
      linkedPassage: "エッジは速い",
      locatePassage: async () => ({ found: false, miss: "single-page-book" }) as const,
    });

    await waitFor(() => expect(view.result.current.passageMiss).toBe("single-page-book"));
  });

  it("keeps quiet while the lookup is still running", async () => {
    const { view } = renderAt(`/books/${PDF_ID}`, {
      linkedPassage: "エッジは速い",
      locatePassage: () => new Promise(() => {}),
    });

    expect(view.result.current.passageMiss).toBeNull();
  });

  it("keeps quiet for a page opened without a linked passage at all", async () => {
    const { view } = renderAt(`/books/${PDF_ID}?page=42`);

    await waitFor(() => expect(paramsOf(view.result.current.search)).toStrictEqual({ page: "42" }));
    expect(view.result.current.passageMiss).toBeNull();
  });
});

describe("useReadingLocation resuming where another device left off", () => {
  it("opens the book at the saved page, with the chat that was open on it", async () => {
    const { store, openChat, view } = renderAt(`/books/${PDF_ID}`);

    await act(async () =>
      view.rerender({
        book: bookLeftAt({ page: 17, selectionId: "a2", outlineOpen: null, chatPanelOpen: null }),
      }),
    );

    expect(store.get(currentPageAtom)).toBe(17);
    expect(openChat).toHaveBeenCalledWith({ id: "a2", selectedText: "V8 isolate", pageNumber: 30 });
    await waitFor(() =>
      expect(paramsOf(view.result.current.search)).toStrictEqual({
        page: "17",
        selection: "a2",
      }),
    );
  });

  it("leaves the address bar alone until the book says where that place is", async () => {
    // Spelling out ?page=1 first would put a page nobody asked for in the URL,
    // and the reader would watch the book jump off it a moment later.
    const { visited, view } = renderAt(`/books/${PDF_ID}`);

    expect(visited).toStrictEqual([""]);

    await act(async () =>
      view.rerender({
        book: bookLeftAt({ page: 4, selectionId: null, outlineOpen: null, chatPanelOpen: null }),
      }),
    );

    await waitFor(() =>
      expect(paramsOf(view.result.current.search)).toStrictEqual({
        page: "4",
      }),
    );
  });

  it("keeps the page a shared link names over the one the server remembers", async () => {
    const { store, view } = renderAt(`/books/${PDF_ID}?page=5`, {
      book: bookLeftAt({ page: 17, selectionId: null, outlineOpen: null, chatPanelOpen: null }),
    });

    await waitFor(() =>
      expect(paramsOf(view.result.current.search)).toStrictEqual({
        page: "5",
      }),
    );
    expect(store.get(currentPageAtom)).toBe(5);
  });

  it("does not haul the reader back once they have started turning pages", async () => {
    const { store, view } = renderAt(`/books/${PDF_ID}`);

    act(() => view.result.current.setCurrentPage(9));
    await act(async () =>
      view.rerender({
        book: bookLeftAt({ page: 17, selectionId: null, outlineOpen: null, chatPanelOpen: null }),
      }),
    );

    expect(store.get(currentPageAtom)).toBe(9);
    await waitFor(() =>
      expect(paramsOf(view.result.current.search)).toStrictEqual({
        page: "9",
      }),
    );
  });

  it("stops at the last page of a book that has since been re-extracted shorter", async () => {
    const { store, view } = renderAt(`/books/${PDF_ID}`);

    await act(async () =>
      view.rerender({
        book: {
          ...bookLeftAt({
            page: BOOK.pageCount + 1,
            selectionId: null,
            outlineOpen: null,
            chatPanelOpen: null,
          }),
        },
      }),
    );

    expect(store.get(currentPageAtom)).toBe(BOOK.pageCount);
  });

  it("shows the highlight list for a saved chat the book has lost, and still restores the page", async () => {
    const { store, openChat, view } = renderAt(`/books/${PDF_ID}`);

    await act(async () =>
      view.rerender({
        book: bookLeftAt({
          page: 17,
          selectionId: "deleted",
          outlineOpen: null,
          chatPanelOpen: null,
        }),
      }),
    );

    expect(store.get(currentPageAtom)).toBe(17);
    expect(openChat).toHaveBeenCalledTimes(0);
    await waitFor(() =>
      expect(paramsOf(view.result.current.search)).toStrictEqual({
        page: "17",
      }),
    );
  });

  it("follows the passage a text-fragment link names rather than the saved page", async () => {
    const { store } = renderAt(`/books/${PDF_ID}`, {
      book: bookLeftAt({ page: 17, selectionId: null, outlineOpen: null, chatPanelOpen: null }),
      linkedPassage: A_PASSAGE,
      locatePassage: async () => ({ found: true, pageNumber: 88 }) as const,
    });

    await waitFor(() => expect(store.get(currentPageAtom)).toBe(88));
  });

  it("folds the outline away on a wide screen when that is how the book was left", async () => {
    const { store, view } = renderAt(`/books/${PDF_ID}`);

    await act(async () =>
      view.rerender({
        book: bookLeftAt({ page: 17, selectionId: null, outlineOpen: false, chatPanelOpen: null }),
      }),
    );

    expect(store.get(currentPageAtom)).toBe(17);
    expect(store.get(outlineOpenAtom)).toBe(false);
  });

  it("leaves a narrow screen's outline alone, since its drawer would cover the page", async () => {
    setViewportWidth(PHONE_WIDTH);
    const { store, view } = renderAt(`/books/${PDF_ID}`);

    await act(async () =>
      view.rerender({
        book: bookLeftAt({ page: 17, selectionId: null, outlineOpen: false, chatPanelOpen: null }),
      }),
    );

    expect(store.get(currentPageAtom)).toBe(17);
    expect(store.get(outlineOpenAtom)).toBe(true);
  });

  it("leaves the outline where it starts when no wide screen has said either way", async () => {
    const { store, view } = renderAt(`/books/${PDF_ID}`);

    await act(async () =>
      view.rerender({
        book: bookLeftAt({ page: 17, selectionId: null, outlineOpen: null, chatPanelOpen: null }),
      }),
    );

    expect(store.get(currentPageAtom)).toBe(17);
    expect(store.get(outlineOpenAtom)).toBe(true);
  });

  it("leaves the chat pane where it starts when no wide screen has said either way", async () => {
    // What a book read only before the panel was saved holds: the column is
    // NULL, which is not "folded away".
    const { store, view } = renderAt(`/books/${PDF_ID}`);

    await act(async () =>
      view.rerender({
        book: bookLeftAt({ page: 17, selectionId: null, outlineOpen: null, chatPanelOpen: null }),
      }),
    );

    expect(store.get(currentPageAtom)).toBe(17);
    expect(store.get(chatPanelOpenAtom)).toBe(true);
  });

  it("calls the place settled only once it is, so nothing saves over it in the meantime", async () => {
    const { view } = renderAt(`/books/${PDF_ID}`);

    expect(view.result.current.locationReady).toBe(false);

    await act(async () =>
      view.rerender({
        book: bookLeftAt({ page: 17, selectionId: null, outlineOpen: null, chatPanelOpen: null }),
      }),
    );

    expect(view.result.current.locationReady).toBe(true);
  });
});

describe("useReadingLocation restoring the panels the book was left with", () => {
  /** The place a reader who folded both panels away left behind. */
  const BOTH_FOLDED = {
    page: 17,
    selectionId: null,
    outlineOpen: false,
    chatPanelOpen: false,
  } as const;

  it("folds the chat pane away when that is how the book was left", async () => {
    const { store, view } = renderAt(`/books/${PDF_ID}`);

    await act(async () => view.rerender({ book: bookLeftAt(BOTH_FOLDED) }));

    expect(store.get(chatPanelOpenAtom)).toBe(false);
  });

  it("brings the folded panels back on a reload, which the URL says nothing about", async () => {
    // The page is the URL's — a reload is a place the reader named — while the
    // panels are the book's, so folding one survives being reloaded onto.
    const { store, view } = renderAt(`/books/${PDF_ID}?page=5`);

    await act(async () => view.rerender({ book: bookLeftAt(BOTH_FOLDED) }));

    expect(store.get(currentPageAtom)).toBe(5);
    expect(store.get(outlineOpenAtom)).toBe(false);
    expect(store.get(chatPanelOpenAtom)).toBe(false);
  });

  it("waits for the book before calling the place settled, even where the URL names a page", async () => {
    // Saying it is settled first is what let the width's default be saved back
    // over the panels the reader had folded away.
    const { view } = renderAt(`/books/${PDF_ID}?page=5`);

    expect(view.result.current.locationReady).toBe(false);

    await act(async () => view.rerender({ book: bookLeftAt(BOTH_FOLDED) }));

    expect(view.result.current.locationReady).toBe(true);
  });

  it("leaves a narrow screen's drawer and sheet alone, since neither sits beside the page", async () => {
    setViewportWidth(PHONE_WIDTH);
    const { store, view } = renderAt(`/books/${PDF_ID}?page=5`);

    await act(async () => view.rerender({ book: bookLeftAt(BOTH_FOLDED) }));

    expect(store.get(currentPageAtom)).toBe(5);
    // Both start open here, so a restore taken would show as `false`
    expect(store.get(outlineOpenAtom)).toBe(true);
    expect(store.get(chatPanelOpenAtom)).toBe(true);
    expect(view.result.current.locationReady).toBe(true);
  });

  it("keeps a panel the reader folded before the book landed", async () => {
    // The header's toggles do not wait for the book, so a reader who folds the
    // outline while it is still being fetched has chosen for themselves — the
    // same way turning a page before it lands outranks the saved page.
    const { store, view } = renderAt(`/books/${PDF_ID}`);

    act(() => view.result.current.setOutlineOpen(false));
    await act(async () =>
      view.rerender({
        book: bookLeftAt({ page: 17, selectionId: null, outlineOpen: true, chatPanelOpen: true }),
      }),
    );

    expect(store.get(outlineOpenAtom)).toBe(false);
  });

  it("keeps a chat pane the reader folded before the book landed", async () => {
    const { store, view } = renderAt(`/books/${PDF_ID}`);

    act(() => view.result.current.setChatPanelOpen(false));
    await act(async () =>
      view.rerender({
        book: bookLeftAt({ page: 17, selectionId: null, outlineOpen: true, chatPanelOpen: true }),
      }),
    );

    expect(store.get(chatPanelOpenAtom)).toBe(false);
  });

  it("keeps the panels the reader moved when the book is fetched again", async () => {
    // The book is revalidated while it is open — saving a highlight refetches
    // it — and taking the saved panels each time would fold away what the
    // reader had just opened.
    const { store, view } = renderAt(`/books/${PDF_ID}`);

    await act(async () => view.rerender({ book: bookLeftAt(BOTH_FOLDED) }));
    // The restore really did take, so what follows is the reader undoing it
    // rather than a restore that never ran
    expect(store.get(outlineOpenAtom)).toBe(false);

    act(() => view.result.current.setOutlineOpen(true));
    await act(async () => view.rerender({ book: bookLeftAt({ ...BOTH_FOLDED }) }));

    expect(store.get(outlineOpenAtom)).toBe(true);
  });
});
