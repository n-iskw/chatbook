// oxlint-disable-next-line no-restricted-imports -- 読書位置とパネルの状態を URL (外部状態) へ同期し、SWR が解決したページを共有ストアへ反映するために必要
import { useEffect, useRef, useState } from "react";
import { useAtom, useAtomValue } from "jotai";
import { useSearchParams } from "react-router";
import useSWRImmutable from "swr/immutable";
import { currentPageAtom, outlineOpenAtom } from "../atoms/pdfAtom";
import { useIsNarrow } from "./useIsNarrow";
import { activeSelectionAtom, chatPanelOpenAtom, type ActiveSelection } from "../atoms/chatAtom";
import type { BookDetail, LocatedPage, PageMiss } from "../../shared/schemas/book";

/** Resolves a quoted passage to the page it appears on, or why it has none. */
export type LocatePassage = (pdfId: string, passage: string) => Promise<LocatedPage>;

/** What the reader is told when a link named a passage the book will not open at. */
export type PassageMiss = PageMiss | "lookup-failed";

/** Puts the chat about a highlight on screen, with whatever was asked before. */
export type OpenChat = (selection: ActiveSelection) => void;

const PAGE_PARAM = "page";
const PANEL_PARAM = "panel";
const PANEL_OPEN = "open";
const PANEL_CLOSED = "closed";
const SELECTION_PARAM = "selection";
const OUTLINE_PARAM = "outline";

/** Nothing is missing until a link named a passage and the answer is in. */
function missOf(
  linkedPassage: string | null,
  linkedPage: LocatedPage | undefined,
  locateError: unknown,
): PassageMiss | null {
  if (linkedPassage === null) return null;
  if (locateError !== undefined) return "lookup-failed";
  if (linkedPage === undefined || linkedPage.found) return null;
  return linkedPage.miss;
}

const FIRST_PAGE = 1;

function parsePage(value: string | null): number | null {
  const page = Number(value);
  return Number.isInteger(page) && page >= FIRST_PAGE ? page : null;
}

/**
 * Whether the URL says the outline was beside the page, or nothing at all.
 *
 * `null` is a URL written before the outline was carried in one — the book's
 * own answer fills that in. Anything but "closed" is open, the same way the
 * panel is read.
 */
function parseOutline(value: string | null): boolean | null {
  return value === null ? null : value !== PANEL_CLOSED;
}

/**
 * Whether the URL leaves the reader's place unsaid.
 *
 * A book opened from the shelf carries none of it: no page, no chat, no quoted
 * passage. Anything else names a place the reader asked for — a reload, a link
 * someone shared — and naming one is how the URL keeps the last word over the
 * place the server remembers.
 */
function opensFromShelf(params: URLSearchParams, linkedPassage: string | null): boolean {
  return (
    parsePage(params.get(PAGE_PARAM)) === null &&
    params.get(SELECTION_PARAM) === null &&
    linkedPassage === null
  );
}

/**
 * Keep the reader's place — the page being read, the state of the panel on the
 * right and the chat open in it — in sync with the URL, so a reload or a shared
 * link resumes there.
 *
 * This hook owns every parameter of the reader's URL, and is the only thing that
 * writes them. `setSearchParams` does not merge within a commit, so a second
 * writer working from its own copy of the query would drop whatever the first
 * one had just put there — and one handler moves the page and the panel at once.
 *
 * The reader's own state is the single source of truth: the URL is read once per
 * book and written on every change. Watching the URL as well would make the
 * two effects feed each other, and the reader would bounce between pages.
 *
 * A `#:~:text=` fragment — what Chrome's "Copy link to highlight" writes — wins
 * over `?page=`, since it names the passage the reader actually wants.
 *
 * `passageMiss` is how a link that named a passage but did not deliver it says
 * so, and which of the reasons it was: the book opens on page 1 either way, and
 * a quote that is nowhere in the book means something different to the reader
 * than a book of one page or a lookup that never answered.
 *
 * The chat named by the URL can only be reopened once `book` arrives, since the
 * highlight it is about is read out of it. `openChat` is the reader's own opener,
 * so a restored chat is the same thing as one picked off the list.
 *
 * A URL that names no place at all — a book opened from the shelf — is resumed
 * from the place the server remembers instead, which is how a book put down on
 * one device is picked up on another.
 *
 * `locationReady` says the reader's place has settled, one way or the other. It
 * is what keeps the saver from writing page 1 over a place still being restored.
 */
export function useReadingLocation(
  pdfId: string | undefined,
  locatePassage: LocatePassage,
  linkedPassage: string | null,
  book: BookDetail | undefined,
  openChat: OpenChat,
): { passageMiss: PassageMiss | null; locationReady: boolean } {
  const [searchParams, setSearchParams] = useSearchParams();
  const [currentPage, setCurrentPage] = useAtom(currentPageAtom);
  const [chatPanelOpen, setChatPanelOpen] = useAtom(chatPanelOpenAtom);
  const activeSelectionId = useAtomValue(activeSelectionAtom)?.id ?? null;
  const [outlineOpen, setOutlineOpen] = useAtom(outlineOpenAtom);
  const isNarrow = useIsNarrow();

  // The chat this book was opened at, until the book itself arrives and says
  // whether that highlight is still in it. Holding it in state rather than a ref
  // is what re-runs the write below once it clears, so a URL naming a highlight
  // the book has lost stops claiming so.
  const [pendingSelectionId, setPendingSelectionId] = useState<string | null>(null);

  // Whether this book is still waiting on the place the server remembers. Read
  // from the URL at the first render rather than in the effect below, so the
  // book never spends a commit claiming to be settled on page 1.
  const [pendingServerPlace, setPendingServerPlace] = useState(() =>
    opensFromShelf(searchParams, linkedPassage),
  );

  // Whether the outline is still waiting on the book, which only a URL that
  // named a page but no outline does — one written before the outline was
  // carried in the address bar. A narrow screen never waits: its outline is a
  // drawer it opens for itself, not a place to be restored to.
  const [pendingOutline, setPendingOutline] = useState(
    () =>
      !opensFromShelf(searchParams, linkedPassage) &&
      parseOutline(searchParams.get(OUTLINE_PARAM)) === null &&
      !isNarrow,
  );

  // The URL is read and written through refs. Both values change identity on
  // every navigation, so depending on them would re-run these effects on each
  // page turn and let them undo one another.
  const searchParamsRef = useRef(searchParams);
  searchParamsRef.current = searchParams;
  const setSearchParamsRef = useRef(setSearchParams);
  setSearchParamsRef.current = setSearchParams;

  // Effects run in declaration order within one commit, so the write below
  // still sees the page from before the book was opened. Writing that would
  // send the reader to page 1 and straight back, which reads as a flicker.
  const urlIsAuthoritative = useRef(true);

  // The page the reader is on, readable without depending on it: the restore
  // below has to know whether they moved first, but must not re-run when they do.
  const currentPageRef = useRef(currentPage);
  currentPageRef.current = currentPage;

  // The width, read the same way: opening a book must not be redone every time
  // the window crosses the boundary between the two layouts.
  const isNarrowRef = useRef(isNarrow);
  isNarrowRef.current = isNarrow;

  // Whether the URL named an outline, so the book's own answer does not
  // overwrite what the reader was handed a link to.
  const urlNamedOutline = useRef(false);

  // Opening a book starts from the place its URL names, not the previous book's
  useEffect(() => {
    const params = searchParamsRef.current;
    const page = parsePage(params.get(PAGE_PARAM)) ?? FIRST_PAGE;
    // Anything but "closed" is an open panel, which is also how a URL that says
    // nothing about the panel is read
    const panelOpen = params.get(PANEL_PARAM) !== PANEL_CLOSED;

    // The outline is read before anything else is decided: it is not part of
    // the place, so a URL naming it has the last word wherever it appears.
    // Narrow screens ignore it — there the outline is a drawer over the page.
    const urlOutline = parseOutline(params.get(OUTLINE_PARAM));
    urlNamedOutline.current = urlOutline !== null;
    if (urlOutline !== null && !isNarrowRef.current) setOutlineOpen(urlOutline);

    urlIsAuthoritative.current = true;
    setChatPanelOpen(panelOpen);

    // Nothing in the URL names a place, so the book's own is the one to open
    // at — and until it arrives there is nothing to spell out here. The panel
    // is set either way: it is not part of the place the server keeps.
    if (opensFromShelf(params, linkedPassage)) {
      setPendingServerPlace(true);
      setPendingOutline(false);
      return;
    }

    setPendingServerPlace(false);
    setPendingOutline(urlOutline === null && !isNarrowRef.current);
    setCurrentPage(page);
    setPendingSelectionId(params.get(SELECTION_PARAM));

    // Spell the place out even where it was implied, so the address bar always
    // holds a link that reopens the book as it stands
    const next = new URLSearchParams(params);
    next.set(PAGE_PARAM, String(page));
    next.set(PANEL_PARAM, panelOpen ? PANEL_OPEN : PANEL_CLOSED);
    // Only where it was named: spelling out the width's own answer while the
    // book's is still on its way would put a value in the address bar for the
    // restore to argue with.
    if (urlOutline !== null && !isNarrowRef.current) {
      next.set(OUTLINE_PARAM, urlOutline ? PANEL_OPEN : PANEL_CLOSED);
    }
    if (next.toString() !== params.toString()) {
      setSearchParamsRef.current(next, { replace: true });
    }
  }, [pdfId, linkedPassage, setCurrentPage, setChatPanelOpen, setOutlineOpen]);

  // Reader -> URL, replacing so page turns do not pile up in the history. Every
  // parameter is written together: one commit, one navigation, nothing dropped.
  useEffect(() => {
    // A book still waiting on its saved place has no place to write yet, and
    // spelling out page 1 in the meantime would put a page nobody asked for in
    // the address bar for the restore to argue with.
    if (pendingServerPlace) return;

    if (urlIsAuthoritative.current) {
      urlIsAuthoritative.current = false;
      return;
    }

    const params = searchParamsRef.current;
    const next = new URLSearchParams(params);
    next.set(PAGE_PARAM, String(currentPage));
    next.set(PANEL_PARAM, chatPanelOpen ? PANEL_OPEN : PANEL_CLOSED);
    // A narrow screen neither writes the outline nor clears it: leaving the
    // parameter untouched keeps whatever a wide screen put there, the same way
    // leaving it out of a save keeps what the server holds. Nothing is written
    // while the book's own answer is still on its way either.
    if (!pendingOutline && !isNarrow) {
      next.set(OUTLINE_PARAM, outlineOpen ? PANEL_OPEN : PANEL_CLOSED);
    }
    // While the chat the URL named is still waiting for its book, the URL is the
    // only place it exists: syncing from the empty atom — which a page turn taken
    // in the meantime would do — would throw away what is being restored.
    if (pendingSelectionId === null) {
      if (activeSelectionId === null) next.delete(SELECTION_PARAM);
      else next.set(SELECTION_PARAM, activeSelectionId);
    }
    if (next.toString() === params.toString()) return;
    setSearchParamsRef.current(next, { replace: true });
  }, [
    currentPage,
    chatPanelOpen,
    activeSelectionId,
    pendingSelectionId,
    pendingServerPlace,
    pendingOutline,
    outlineOpen,
    isNarrow,
  ]);

  // The place the server remembers, taken up once the book can say which
  // highlight the saved chat is and how far the book goes.
  //
  // This is the one restore that moves the page: the URL names none here, and
  // the page, the chat and the outline were written as one place, so opening
  // the chat without the page it was open on would land the reader elsewhere.
  // Where the URL does name a page it stays the authority, and the chat is
  // reopened without moving off it.
  useEffect(() => {
    if (!pendingServerPlace || book === undefined) return;

    const place = book.readingState;
    // A reader who turned a page before the book landed has chosen a place of
    // their own, and it outranks the one they left on another device.
    if (place !== null && currentPageRef.current === FIRST_PAGE) {
      // A book re-extracted shorter can no longer hold the page it was left on
      setCurrentPage(Math.min(place.page, book.pageCount));

      const highlight = book.selections.find((selection) => selection.id === place.selectionId);
      if (highlight !== undefined) {
        openChat({
          id: highlight.id,
          selectedText: highlight.selectedText,
          pageNumber: highlight.pageNumber,
        });
      }

      // Only where the outline sits beside the page. On a narrow screen it
      // arrives as a drawer over what is being read, which is the opposite of
      // resuming; `null` is a book no wide screen has said either way about.
      if (place.outlineOpen !== null && !isNarrow && !urlNamedOutline.current) {
        setOutlineOpen(place.outlineOpen);
      }
    }

    // The URL has had no say over this book, so the write above owes it one
    // rather than skipping its turn.
    urlIsAuthoritative.current = false;
    setPendingServerPlace(false);
  }, [pendingServerPlace, book, openChat, setCurrentPage, setOutlineOpen, isNarrow]);

  // The outline of a link that named a page but no outline — one written before
  // the address bar carried it. The page stays the URL's; only the outline is
  // filled in from the book, and the write above waits on this so the width's
  // own answer is never saved over what the reader folded away.
  useEffect(() => {
    if (!pendingOutline || book === undefined) return;

    const saved = book.readingState?.outlineOpen ?? null;
    if (saved !== null && !isNarrow) setOutlineOpen(saved);
    setPendingOutline(false);
  }, [pendingOutline, book, setOutlineOpen, isNarrow]);

  // The chat named by the URL, reopened as soon as the book can say which
  // highlight that is
  useEffect(() => {
    if (pendingSelectionId === null || book === undefined) return;

    const highlight = book.selections.find((selection) => selection.id === pendingSelectionId);
    if (highlight !== undefined) {
      openChat({
        id: highlight.id,
        selectedText: highlight.selectedText,
        pageNumber: highlight.pageNumber,
      });
    }

    // Cleared either way: a highlight that is no longer in the book leaves the
    // list showing, and the write above takes the id back out of the URL.
    setPendingSelectionId(null);
  }, [book, pendingSelectionId, openChat]);

  // Where a passage sits in a book cannot change while the book is open, so
  // this is asked once per link and never revalidated.
  const { data: linkedPage, error: locateError } = useSWRImmutable(
    pdfId && linkedPassage ? [pdfId, "locate", linkedPassage] : null,
    () => locatePassage(pdfId!, linkedPassage!),
  );

  useEffect(() => {
    if (linkedPage?.found) setCurrentPage(linkedPage.pageNumber);
  }, [linkedPage, setCurrentPage]);

  // `undefined` is "still asking" and must not raise this; anything else is the
  // server's answer, or the lookup itself never getting one.
  const passageMiss = missOf(linkedPassage, linkedPage, locateError);

  return { passageMiss, locationReady: !pendingServerPlace && !pendingOutline };
}
