// oxlint-disable-next-line no-restricted-imports -- 読書位置を URL (外部状態) へ同期するために必要
import { useEffect, useRef } from "react";
import { useAtom } from "jotai";
import { useSearchParams } from "react-router";
import { currentPageAtom } from "../atoms/pdfAtom";

/** Resolves a quoted passage to the page it appears on, or null if absent. */
export type LocatePassage = (pdfId: string, passage: string) => Promise<number | null>;

const PAGE_PARAM = "page";

function parsePage(value: string | null): number | null {
  const page = Number(value);
  return Number.isInteger(page) && page >= 1 ? page : null;
}

/**
 * Keep the page being read and the URL in sync, so a reload or a shared link
 * resumes on the same page.
 *
 * The page being read is the single source of truth: the URL is read once per
 * book and written on every page turn. Watching the URL as well would make the
 * two effects feed each other, and the reader would bounce between pages.
 *
 * A `#:~:text=` fragment — what Chrome's "Copy link to highlight" writes — wins
 * over `?page=`, since it names the passage the reader actually wants.
 */
export function useReadingLocation(
  pdfId: string | undefined,
  locatePassage: LocatePassage,
  linkedPassage: string | null,
): void {
  const [searchParams, setSearchParams] = useSearchParams();
  const [currentPage, setCurrentPage] = useAtom(currentPageAtom);

  // The URL is read through a ref so that writing to it cannot re-trigger the
  // effects that read it
  const searchParamsRef = useRef(searchParams);
  searchParamsRef.current = searchParams;

  // Opening a book starts from the page its URL names, not the previous book's
  useEffect(() => {
    setCurrentPage(parsePage(searchParamsRef.current.get(PAGE_PARAM)) ?? 1);
  }, [pdfId, setCurrentPage]);

  // Reader -> URL, replacing so page turns do not pile up in the history
  useEffect(() => {
    const next = new URLSearchParams(searchParamsRef.current);
    if (next.get(PAGE_PARAM) === String(currentPage)) return;
    next.set(PAGE_PARAM, String(currentPage));
    setSearchParams(next, { replace: true });
  }, [currentPage, setSearchParams]);

  useEffect(() => {
    if (!pdfId || !linkedPassage) return;

    let cancelled = false;
    locatePassage(pdfId, linkedPassage)
      .then((page) => {
        if (!cancelled && page) setCurrentPage(page);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [pdfId, linkedPassage, locatePassage, setCurrentPage]);
}
