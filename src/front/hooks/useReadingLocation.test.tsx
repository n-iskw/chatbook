import { describe, it, expect, vi } from "vite-plus/test";
import { renderHook, act, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { Provider, createStore, useSetAtom } from "jotai";
import type { ReactNode } from "react";
import { useReadingLocation, type LocatePassage } from "./useReadingLocation";
import { currentPageAtom } from "../atoms/pdfAtom";
import { activeSelectionAtom, chatPanelOpenAtom, type ActiveSelection } from "../atoms/chatAtom";
import { SwrTestCache } from "../../test/swrTestCache";
import type { BookDetail } from "../../shared/schemas/book";
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
  const { passageMiss } = useReadingLocation(PDF_ID, locatePassage, linkedPassage, book, openChat);

  const { search } = useLocation();
  if (visited[visited.length - 1] !== search) visited.push(search);

  return {
    search,
    passageMiss,
    setCurrentPage: useSetAtom(currentPageAtom),
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

    await waitFor(() =>
      expect(paramsOf(view.result.current.search)).toStrictEqual({ page: "7", panel: "open" }),
    );
    expect(store.get(currentPageAtom)).toBe(7);
  });

  it("stays on the page it was given instead of bouncing back to the first one", async () => {
    const { store, visited, view } = renderAt(`/books/${PDF_ID}?page=20`);

    await waitFor(() =>
      expect(paramsOf(view.result.current.search)).toStrictEqual({ page: "20", panel: "open" }),
    );

    // Spelling the panel out takes another replace, but page 20 is the only page
    // any of them names
    expect(new Set(visited.map(pageOf))).toStrictEqual(new Set(["20"]));
    expect(store.get(currentPageAtom)).toBe(20);
  });

  it("opens with the panel folded away when the URL says it is closed", () => {
    const { store } = renderAt(`/books/${PDF_ID}?page=3&panel=closed`);

    expect(store.get(chatPanelOpenAtom)).toBe(false);
  });

  it("spells the open panel out so the address bar reopens the reader as it stands", async () => {
    const { store, view } = renderAt(`/books/${PDF_ID}`);

    await waitFor(() =>
      expect(paramsOf(view.result.current.search)).toStrictEqual({ page: "1", panel: "open" }),
    );
    expect(store.get(chatPanelOpenAtom)).toBe(true);
  });

  it("writes the folded panel into the URL, keeping the page being read", async () => {
    const { view } = renderAt(`/books/${PDF_ID}?page=12`);

    act(() => view.result.current.setChatPanelOpen(false));

    await waitFor(() =>
      expect(paramsOf(view.result.current.search)).toStrictEqual({ page: "12", panel: "closed" }),
    );
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
        panel: "open",
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
        panel: "open",
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
      expect(paramsOf(view.result.current.search)).toStrictEqual({ page: "5", panel: "open" }),
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
        panel: "open",
        selection: "a2",
      }),
    );

    act(() => view.result.current.setActiveSelection(null));

    await waitFor(() =>
      expect(paramsOf(view.result.current.search)).toStrictEqual({ page: "12", panel: "open" }),
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
        panel: "open",
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
    expect(paramsOf(view.result.current.search)).toStrictEqual({ page: "1", panel: "open" });
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

    await waitFor(() =>
      expect(paramsOf(view.result.current.search)).toStrictEqual({ page: "42", panel: "open" }),
    );
    expect(view.result.current.passageMiss).toBeNull();
  });
});
