import { bookOutlineSchema, type BookOutline } from "../../shared/schemas/book";

/**
 * The slice of the book a chat sends instead of the whole text. `text` is
 * always a verbatim run of consecutive pages out of `fullText` (pages joined
 * with the same \f they were stored with), so a passage the model quotes from
 * it is guaranteed to be found again by findPageNumber's whole-text scan.
 */
export interface DocumentExcerpt {
  text: string;
  startPage: number;
  endPage: number;
  totalPages: number;
  isPartial: boolean;
}

/**
 * Pages taken on each side of the highlight when the book has no usable
 * outline. 10 makes a 21-page excerpt — about one chapter of a typical
 * 200-page, 10-to-15-chapter technical book, which is the unit the chapter
 * path sends when it can.
 */
export const FALLBACK_WINDOW_PAGES = 10;

const PAGE_DELIMITER = "\f";

/**
 * Read the stored outline column. NULL, broken JSON and JSON of the wrong
 * shape all mean the same thing downstream — no chapter bounds, use the page
 * window — so none of them is worth failing the chat over (the same stance
 * readPositionData takes on a broken highlight row).
 */
export function readStoredOutline(stored: string | null): BookOutline | null {
  if (stored === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(stored);
  } catch {
    return null;
  }
  const outline = bookOutlineSchema.safeParse(parsed);
  return outline.success ? outline.data : null;
}

/**
 * Cut the part of the book worth sending with a question about the page the
 * highlight sits on: the chapter holding that page when the outline names
 * one, a FALLBACK_WINDOW_PAGES window around it otherwise. The page count is
 * taken from the text itself (its \f seams), never from a stored column, so
 * a mismatch cannot label a whole text as partial or cut past the last page.
 * A text without seams — one-page books, rows stored before the delimiter —
 * is sent whole.
 */
export function selectExcerpt(
  fullText: string,
  selectionPage: number,
  outline: BookOutline | null,
): DocumentExcerpt {
  const pages = fullText.split(PAGE_DELIMITER);
  const totalPages = pages.length;
  if (totalPages <= 1) {
    return { text: fullText, startPage: 1, endPage: totalPages, totalPages, isPartial: false };
  }

  const page = Math.min(Math.max(selectionPage, 1), totalPages);
  const { startPage, endPage } = chapterBounds(outline, page, totalPages) ?? {
    startPage: Math.max(1, page - FALLBACK_WINDOW_PAGES),
    endPage: Math.min(totalPages, page + FALLBACK_WINDOW_PAGES),
  };

  return {
    text: pages.slice(startPage - 1, endPage).join(PAGE_DELIMITER),
    startPage,
    endPage,
    totalPages,
    isPartial: !(startPage === 1 && endPage === totalPages),
  };
}

/**
 * The chapter interval holding `page`, or null when the outline gives no
 * usable bounds. Chapter starts outside the book are dropped; two chapters
 * naming the same start page collapse into the first, so no chapter is ever
 * empty. Pages before the first chapter form a front-matter interval of
 * their own.
 */
function chapterBounds(
  outline: BookOutline | null,
  page: number,
  totalPages: number,
): { startPage: number; endPage: number } | null {
  if (!outline) return null;

  const starts = [
    ...new Set(
      outline
        .map((chapter) => chapter.pageNumber)
        .filter((start) => start >= 1 && start <= totalPages)
        .sort((a, b) => a - b),
    ),
  ];
  if (starts.length === 0) return null;

  const bounds = [1, ...starts, totalPages + 1];
  const index = bounds.findLastIndex((start) => start <= page);
  return { startPage: bounds[index], endPage: bounds[index + 1] - 1 };
}
