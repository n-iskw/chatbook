// oxlint-disable-next-line no-restricted-imports -- 読書位置とパネルの状態を URL (外部状態) へ同期し、SWR が解決したページを共有ストアへ反映するために必要
import { useEffect, useRef, useState } from "react";
import { useAtom, useAtomValue } from "jotai";
import { useSearchParams } from "react-router";
import useSWRImmutable from "swr/immutable";
import { currentPageAtom } from "../atoms/pdfAtom";
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

function parsePage(value: string | null): number | null {
  const page = Number(value);
  return Number.isInteger(page) && page >= 1 ? page : null;
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
 */
export function useReadingLocation(
  pdfId: string | undefined,
  locatePassage: LocatePassage,
  linkedPassage: string | null,
  book: BookDetail | undefined,
  openChat: OpenChat,
): { passageMiss: PassageMiss | null } {
  const [searchParams, setSearchParams] = useSearchParams();
  const [currentPage, setCurrentPage] = useAtom(currentPageAtom);
  const [chatPanelOpen, setChatPanelOpen] = useAtom(chatPanelOpenAtom);
  const activeSelectionId = useAtomValue(activeSelectionAtom)?.id ?? null;

  // The chat this book was opened at, until the book itself arrives and says
  // whether that highlight is still in it. Holding it in state rather than a ref
  // is what re-runs the write below once it clears, so a URL naming a highlight
  // the book has lost stops claiming so.
  const [pendingSelectionId, setPendingSelectionId] = useState<string | null>(null);

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

  // Opening a book starts from the place its URL names, not the previous book's
  useEffect(() => {
    const params = searchParamsRef.current;
    const page = parsePage(params.get(PAGE_PARAM)) ?? 1;
    // Anything but "closed" is an open panel, which is also how a URL that says
    // nothing about the panel is read
    const panelOpen = params.get(PANEL_PARAM) !== PANEL_CLOSED;

    urlIsAuthoritative.current = true;
    setCurrentPage(page);
    setChatPanelOpen(panelOpen);
    setPendingSelectionId(params.get(SELECTION_PARAM));

    // Spell the place out even where it was implied, so the address bar always
    // holds a link that reopens the book as it stands
    const next = new URLSearchParams(params);
    next.set(PAGE_PARAM, String(page));
    next.set(PANEL_PARAM, panelOpen ? PANEL_OPEN : PANEL_CLOSED);
    if (next.toString() !== params.toString()) {
      setSearchParamsRef.current(next, { replace: true });
    }
  }, [pdfId, setCurrentPage, setChatPanelOpen]);

  // Reader -> URL, replacing so page turns do not pile up in the history. Every
  // parameter is written together: one commit, one navigation, nothing dropped.
  useEffect(() => {
    if (urlIsAuthoritative.current) {
      urlIsAuthoritative.current = false;
      return;
    }

    const params = searchParamsRef.current;
    const next = new URLSearchParams(params);
    next.set(PAGE_PARAM, String(currentPage));
    next.set(PANEL_PARAM, chatPanelOpen ? PANEL_OPEN : PANEL_CLOSED);
    // While the chat the URL named is still waiting for its book, the URL is the
    // only place it exists: syncing from the empty atom — which a page turn taken
    // in the meantime would do — would throw away what is being restored.
    if (pendingSelectionId === null) {
      if (activeSelectionId === null) next.delete(SELECTION_PARAM);
      else next.set(SELECTION_PARAM, activeSelectionId);
    }
    if (next.toString() === params.toString()) return;
    setSearchParamsRef.current(next, { replace: true });
  }, [currentPage, chatPanelOpen, activeSelectionId, pendingSelectionId]);

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

  return { passageMiss };
}
