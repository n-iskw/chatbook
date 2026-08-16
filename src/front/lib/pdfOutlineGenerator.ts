import type { PDFDocumentProxy } from "pdfjs-dist";
import type { OutlineEntry } from "../../shared/schemas/book";

interface TextItemLike {
  str: string;
  hasEOL?: boolean;
  transform?: number[];
}

interface ChapterCandidate {
  key: string;
  title: string;
  pageNumber: number;
}

interface ContentsRow {
  title: string;
  printedPage: number | null;
  sourcePage: number;
  x: number;
  y: number;
  level: number;
}

interface PositionedItem {
  str: string;
  x: number;
  y: number;
}

interface PageText {
  items: PositionedItem[];
  lines: string[];
  compact: string;
}

const CHAPTER_RE = /第\s*(\d+)\s*章/gu;
const MAX_TITLE_LENGTH = 160;

function normalized(text: string): string {
  return text.replace(/\s+/gu, " ").trim();
}

function compact(text: string): string {
  return normalized(text).replace(/\s+/gu, "");
}

function cleanContentsTitle(text: string): string {
  return normalized(text)
    .replace(/^[|｜\s]+/u, "")
    .replace(/^COLUMN\s*/iu, "")
    .replace(/^[-‐‑‒–—―一]+\s*/u, "")
    .replace(/[.．。…]+$/u, "")
    .trim();
}

/** Keep the OCR text but discard columns that describe the table of contents. */
function titleFromLine(line: string, start: number, end: number): string {
  const raw = normalized(line.slice(start, end));
  const marker = raw.match(/^第\s*\d+\s*章/iu)?.[0] ?? "";
  const rest = raw.slice(marker.length).trim();
  const withoutMetadata = rest.split(/\s+(?:著者名|内容|分類|担当)\s*/u, 1)[0];
  const withoutPageNumber = withoutMetadata.replace(/\s+\d{1,4}$/u, "").trim();
  const title = normalized(`${marker} ${withoutPageNumber}`);
  return title.slice(0, MAX_TITLE_LENGTH);
}

/** Preserve line boundaries from the OCR text layer when pdf.js provides them. */
function linesFromItems(items: unknown[]): string[] {
  const lines: string[] = [];
  let line = "";
  let lastY: number | undefined;

  const flush = () => {
    const value = normalized(line);
    if (value) lines.push(value);
    line = "";
  };

  for (const item of items) {
    if (!item || typeof item !== "object" || !("str" in item)) continue;
    const textItem = item as TextItemLike;
    const y = textItem.transform?.[5];
    if (line && y !== undefined && lastY !== undefined && Math.abs(y - lastY) > 2) flush();
    line += `${textItem.str} `;
    lastY = y;
    if (textItem.hasEOL) flush();
  }
  flush();
  return lines;
}

function positionedItems(items: unknown[]): PositionedItem[] {
  return items.flatMap((item) => {
    if (!item || typeof item !== "object" || !("str" in item)) return [];
    const textItem = item as TextItemLike;
    const transform = textItem.transform;
    return [
      {
        str: textItem.str,
        x: transform?.[4] ?? 0,
        y: transform?.[5] ?? 0,
      },
    ];
  });
}

function chapterNumber(text: string): string | null {
  return text.match(/^第\s*(\d+)\s*章$/u)?.[1] ?? null;
}

/** Read the actual chapter-title column on a printed contents page. */
function contentsEntries(items: PositionedItem[], pageNumber: number): ChapterCandidate[] {
  const chapterItems = items.filter((item) => chapterNumber(normalized(item.str)) !== null);

  return chapterItems.flatMap((chapter) => {
    const number = chapterNumber(normalized(chapter.str));
    if (!number) return [];

    const title = items
      .filter(
        (item) =>
          item.x > 110 && item.x < 400 && Math.abs(item.y - chapter.y) <= 3 && item.str.trim(),
      )
      .sort((left, right) => left.x - right.x)
      .map((item) => item.str)
      .join(" ");
    const cleanTitle = normalized(title);
    if (!cleanTitle) return [];

    return [{ key: number, title: `第${number}章 ${cleanTitle}`, pageNumber }];
  });
}

function contentsRows(items: PositionedItem[], sourcePage: number): ContentsRow[] {
  const groups: PositionedItem[][] = [];

  for (const item of [...items].filter((item) => item.str.trim()).sort((a, b) => b.y - a.y)) {
    const group = groups.find((candidate) => Math.abs(candidate[0].y - item.y) <= 6);
    if (group) group.push(item);
    else groups.push([item]);
  }

  const rows = groups.flatMap((group) => {
    const ordered = group.toSorted((left, right) => left.x - right.x);
    const rightColumn = ordered.filter((item) => item.x >= 500);
    const printedPageText = rightColumn
      .map((item) => item.str)
      .join("")
      .replace(/\D/gu, "");
    const printedPage = printedPageText ? Number(printedPageText) : null;

    const titleItems = ordered.filter((item) => item.x < 500);
    const title = cleanContentsTitle(titleItems.map((item) => item.str).join(" "));
    if (!title || title === "目次" || /^(?:\d+|[ivxlcdm]+|[*$]+)$/iu.test(title)) {
      return [];
    }

    return [
      {
        title,
        printedPage,
        sourcePage,
        x: titleItems[0]?.x ?? 0,
        y: group[0].y,
        level: 0,
      },
    ];
  });

  const sectionRows = rows.filter((row) => row.x >= 120 && !/^第\s*\d+\s*章/iu.test(row.title));
  const baseX = Math.min(...sectionRows.map((row) => row.x));

  return rows.map((row) => ({
    ...row,
    level: row.x < 135 ? 0 : Math.max(1, Math.round((row.x - baseX) / 18) + 1),
  }));
}

function hasChapterMarkerNearStart(page: PageText, chapterKey: string): boolean {
  const head = page.items
    .slice(0, 20)
    .map((item) => item.str)
    .join("");
  return head.includes("第") && head.includes("章") && head.includes(chapterKey);
}

function findPageContaining(
  pages: PageText[],
  startIndex: number,
  title: string,
  preferredPage: number | null = null,
): number {
  const target = compact(title);
  if (!target) return -1;

  const matches = pages.flatMap((page, index) => {
    if (index < startIndex || !page.compact.includes(target)) return [];
    return [index];
  });
  const exactHeadingMatches = matches.filter((index) =>
    pages[index].items.some((item) => item.x < 220 && compact(item.str) === target),
  );
  const candidates = exactHeadingMatches.length > 0 ? exactHeadingMatches : matches;
  if (preferredPage === null) return candidates.length === 1 ? candidates[0] : -1;
  const nearest =
    candidates.toSorted(
      (left, right) => Math.abs(left + 1 - preferredPage) - Math.abs(right + 1 - preferredPage),
    )[0] ?? -1;
  return nearest >= 0 && Math.abs(nearest + 1 - preferredPage) <= 12 ? nearest : -1;
}

function fillMissingPageNumbers(entries: OutlineEntry[]): void {
  for (const entry of entries) {
    fillMissingPageNumbers(entry.children);
    if (entry.pageNumber === null) {
      const childPages = entry.children.flatMap((child) =>
        child.pageNumber === null ? [] : [child.pageNumber],
      );
      entry.pageNumber = childPages.length > 0 ? Math.min(...childPages) : null;
    }
  }
}

function deduplicateOutline(entries: OutlineEntry[]): void {
  for (const entry of entries) deduplicateOutline(entry.children);

  const seen = new Set<string>();
  for (let index = entries.length - 1; index >= 0; index--) {
    const entry = entries[index];
    const key = `${entry.title}\u0000${entry.pageNumber ?? ""}`;
    if (seen.has(key)) entries.splice(index, 1);
    else seen.add(key);
  }
}

function candidatesOnPage(lines: string[], pageNumber: number): ChapterCandidate[] {
  const candidates: ChapterCandidate[] = [];

  for (const line of lines) {
    const matches = [...line.matchAll(CHAPTER_RE)];
    for (const [index, match] of matches.entries()) {
      const start = match.index ?? 0;
      const end = matches[index + 1]?.index ?? line.length;
      const chapterNumber = match[1];
      const title = titleFromLine(line, start, end);
      if (title === `第${chapterNumber}章`) continue;

      candidates.push({
        key: String(Number(chapterNumber)),
        title,
        pageNumber,
      });
    }
  }

  return candidates;
}

/**
 * Build a chatbook outline from a printed contents page and OCR text layer.
 *
 * Chapter and section rows from the contents page become nested entries. The
 * first matching heading elsewhere in the document becomes each destination.
 * This avoids linking the outline back to the printed contents page itself.
 */
export async function generateOutlineFromPdf(doc: PDFDocumentProxy): Promise<OutlineEntry[]> {
  const pages: PageText[] = [];

  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    const items = positionedItems(content.items);
    const lines = linesFromItems(content.items);
    pages.push({
      items,
      lines,
      compact: normalized(items.map((item) => item.str).join(" ")).replace(/\s+/gu, ""),
    });
  }

  const tablePages = pages.map((page, index) => contentsEntries(page.items, index + 1));
  const contentsPageIndex = tablePages.reduce(
    (best, entries, index) =>
      entries.length > (best?.entries.length ?? 0) ? { index, entries } : best,
    null as { index: number; entries: ChapterCandidate[] } | null,
  );

  if (contentsPageIndex && contentsPageIndex.entries.length >= 2) {
    const firstEntry = [...contentsPageIndex.entries].sort(
      (left, right) => Number(left.key) - Number(right.key),
    )[0];
    const firstBodyPage = pages.findIndex(
      (page, index) =>
        index > contentsPageIndex.index &&
        page.compact.startsWith(normalized(firstEntry.title).replace(/\s+/gu, "")),
    );
    const bodyStart = firstBodyPage >= 0 ? firstBodyPage : contentsPageIndex.index + 1;

    const entries = contentsPageIndex.entries.map((entry) => {
      const target = compact(entry.title);
      const titleOnly = compact(entry.title.replace(/^第\s*\d+\s*章\s*/u, ""));
      const destinationNearHeading = pages.findIndex((page, index) => {
        if (index < bodyStart) return false;
        const position = page.compact.indexOf(titleOnly);
        const shortTitle = titleOnly.length <= 8;
        const hasExpectedMarker = !shortTitle || hasChapterMarkerNearStart(page, entry.key);
        return position >= 0 && position < 80 && hasExpectedMarker;
      });
      const destinationWithChapter = pages.findIndex(
        (page, index) => index >= bodyStart && page.compact.includes(target),
      );
      const destination =
        destinationNearHeading >= 0
          ? destinationNearHeading
          : destinationWithChapter >= 0
            ? destinationWithChapter
            : pages.findIndex(
                (page, index) => index >= bodyStart && page.compact.includes(titleOnly),
              );
      return {
        title: entry.title,
        pageNumber: destination >= 0 ? destination + 1 : contentsPageIndex.index + 1,
        children: [],
      };
    });

    const detailedRows = pages
      .flatMap((page, index) => {
        if (
          index <= contentsPageIndex.index ||
          !page.items.some((item) => compact(item.str).includes("目次"))
        ) {
          return [];
        }

        const rows = contentsRows(page.items, index + 1);
        const printedPages = rows.flatMap((row) =>
          row.printedPage === null ? [] : [row.printedPage],
        );
        return [{ rows, order: Math.min(...printedPages), sourcePage: index + 1 }];
      })
      .toSorted((left, right) => left.order - right.order || left.sourcePage - right.sourcePage)
      .flatMap((page) => page.rows);
    const rootPrintedPages = Array.from({ length: entries.length }, () => null as number | null);
    let currentRoot = -1;
    let stack: Array<{ level: number; entry: OutlineEntry }> = [];

    for (const row of detailedRows) {
      const rowCompact = compact(row.title);
      const titleIndex = entries.findIndex((entry) => {
        const titleOnly = compact(entry.title.replace(/^第\s*\d+\s*章\s*/u, ""));
        const titleMatch = titleOnly.length > 8 && rowCompact.includes(titleOnly);
        return titleMatch;
      });
      const hasChapterMarker =
        row.x < 135 && (/[第章号]/u.test(rowCompact) || /^[$*]?\d+[$*]?$/u.test(rowCompact));
      const explicitChapterIndex = hasChapterMarker
        ? entries.findIndex((_, index) => rowCompact.includes(contentsPageIndex.entries[index].key))
        : -1;
      const sequentialChapterIndex =
        hasChapterMarker && explicitChapterIndex < 0 && currentRoot + 1 < entries.length
          ? currentRoot + 1
          : -1;
      const chapterIndex =
        titleIndex >= 0
          ? titleIndex
          : explicitChapterIndex >= 0
            ? explicitChapterIndex
            : sequentialChapterIndex;
      const chapterTitleFragment = entries.some((entry) => {
        const titleOnly = compact(entry.title.replace(/^第\s*\d+\s*章\s*/u, ""));
        return rowCompact.length > 3 && titleOnly.startsWith(rowCompact);
      });

      if (chapterIndex >= 0) {
        currentRoot = chapterIndex;
        rootPrintedPages[chapterIndex] ??= row.printedPage;
        stack = [];
        continue;
      }

      if (hasChapterMarker || chapterTitleFragment) continue;
      if (currentRoot < 0 || /^(あとがき|索引)$/u.test(row.title)) continue;

      const root = entries[currentRoot];
      if (!root) continue;
      if (rootPrintedPages[currentRoot] === null && row.printedPage !== null) {
        rootPrintedPages[currentRoot] = row.printedPage - 1;
      }
      const rootPrintedPage = rootPrintedPages[currentRoot] ?? null;
      const expectedPage =
        rootPrintedPage === null || row.printedPage === null
          ? null
          : root.pageNumber + row.printedPage - rootPrintedPage;
      const destination = findPageContaining(pages, bodyStart, row.title, expectedPage);
      const child: OutlineEntry = {
        title: row.title,
        pageNumber: destination >= 0 ? destination + 1 : expectedPage,
        children: [],
      };

      while (stack.length > 0 && stack.at(-1)!.level >= row.level) stack.pop();
      const parent = stack.at(-1)?.entry ?? root;
      parent.children.push(child);
      stack.push({ level: row.level, entry: child });
    }

    deduplicateOutline(entries);
    fillMissingPageNumbers(entries);
    return entries;
  }

  const pageCandidates = pages.map((page, index) => candidatesOnPage(page.lines, index + 1));
  const contentsPages = new Set(
    pageCandidates
      .map((candidates, index) => (candidates.length >= 2 ? index + 1 : null))
      .filter((pageNumber): pageNumber is number => pageNumber !== null),
  );
  const selected = pageCandidates
    .flatMap((candidates) => candidates)
    .filter((candidate) => !contentsPages.has(candidate.pageNumber));
  const pool = selected.length > 0 ? selected : pageCandidates.flatMap((candidates) => candidates);
  const seen = new Set<string>();

  return pool.reduce<OutlineEntry[]>((outline, candidate) => {
    if (seen.has(candidate.key)) return outline;
    seen.add(candidate.key);
    outline.push({ title: candidate.title, pageNumber: candidate.pageNumber, children: [] });
    return outline;
  }, []);
}
