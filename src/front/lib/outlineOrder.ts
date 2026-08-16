import type { OutlineEntry } from "../../shared/schemas/book";

function comparePageNumbers(left: number | null, right: number | null): number {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return left - right;
}

/** Keep saved and newly generated outlines in the document's reading order. */
export function sortOutlineByPage(entries: OutlineEntry[]): OutlineEntry[] {
  return entries
    .toSorted((left, right) => comparePageNumbers(left.pageNumber, right.pageNumber))
    .map((entry) => ({ ...entry, children: sortOutlineByPage(entry.children) }));
}

/** Detect the malformed OCR outline shape produced by the earlier generator. */
export function outlineNeedsRepair(entries: OutlineEntry[]): boolean {
  const chapterNumbers = entries.flatMap((entry) => {
    const match = entry.title.match(/^第\s*(\d+)\s*章/u);
    return match ? [Number(match[1])] : [];
  });
  const isOutOfOrder = chapterNumbers.some(
    (chapterNumber, index) => index > 0 && chapterNumber < chapterNumbers[index - 1],
  );
  const hasGenericChapterTitle = entries.some((entry) =>
    /(?:で詳しく解説|以降で詳しく|で解説)/u.test(entry.title),
  );
  return chapterNumbers.length >= 2 && (isOutOfOrder || hasGenericChapterTitle);
}
