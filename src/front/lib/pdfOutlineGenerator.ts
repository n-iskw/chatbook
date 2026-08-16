import type { PDFDocumentProxy } from "pdfjs-dist";
import type { OutlineEntry } from "../../shared/schemas/book";
import { sortOutlineByPage } from "./outlineOrder";

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
    const rightColumn = ordered.filter((item) => item.x >= 480);
    // OCR occasionally puts a stray page number or a running-header number
    // in the same right-hand group. The last numeric token is the one aligned
    // with the row title (for example `782622` + `20` should be page 20).
    const printedPageTokens = rightColumn.flatMap((item) => item.str.match(/\d{1,4}/gu) ?? []);
    const printedPageText = printedPageTokens.at(-1) ?? "";
    const printedPage = printedPageText ? Number(printedPageText) : null;

    const titleItems = ordered.filter((item) => item.x < 480);
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
    level:
      row.x < 120
        ? 0
        : (() => {
            const sectionNumber = row.title.match(/^\d+(?:\.\d+)+/u)?.[0];
            if (sectionNumber) return sectionNumber.split(".").length - 1;
            return Math.max(1, Math.round((row.x - baseX) / 18) + 1);
          })(),
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
    pages[index].lines.some((line) => compact(line).startsWith(target)),
  );
  const candidates = exactHeadingMatches.length > 0 ? exactHeadingMatches : matches;
  if (preferredPage === null) return candidates[0] ?? -1;
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

function chapterNumberFromContentsRow(row: ContentsRow): string | null {
  if (row.x >= 135) return null;
  const match = row.title.match(/^(?:第\s*)?[*$'·|"]?\s*(\d+)[*$'·|"]?\s*(?:章)?(?:\s|$)/u);
  if (!match) return null;
  const remainder = row.title.slice(match[0].length).trim();
  return remainder.length >= 2 ? String(Number(match[1])) : null;
}

function isUnnumberedChapterRow(row: ContentsRow): boolean {
  return row.x < 135 && /^(?:第\s*)?[*$'·|"]?\s*章(?:\s|$)/u.test(row.title);
}

function canonicalChapterTitle(title: string, chapterNumber: string): string {
  const marker =
    title.match(/^(?:第\s*)?[*$'·|"]?\s*\d+[*$'·|"]?\s*(?:章)?\s*/u) ??
    title.match(/^(?:第\s*)?[*$'·|"]?\s*章\s*/u);
  const rest = (marker ? title.slice(marker[0].length) : title).replace(/^[*$'·|"\s]+/u, "").trim();
  return normalized(`第${chapterNumber}章 ${rest}`);
}

/** Find real chapter openings, not explanatory sentences mentioning another chapter. */
function bodyChapterCandidates(pages: PageText[], startIndex: number): ChapterCandidate[] {
  const seen = new Set<string>();
  const candidates: ChapterCandidate[] = [];

  for (let index = startIndex; index < pages.length; index++) {
    for (const line of pages[index].lines.slice(0, 12)) {
      const match = line.match(/^第\s*(\d+)\s*章\s+(.+)$/u);
      if (!match || seen.has(match[1])) continue;
      seen.add(match[1]);
      candidates.push({
        key: match[1],
        title: canonicalChapterTitle(line, match[1]),
        pageNumber: index + 1,
      });
    }
  }

  return candidates;
}

function isContentsLikePage(page: PageText, pageNumber: number): boolean {
  const rows = contentsRows(page.items, pageNumber);
  const chapterRows = rows.filter(
    (row) => chapterNumberFromContentsRow(row) !== null || isUnnumberedChapterRow(row),
  );
  const printedRows = rows.filter((row) => row.printedPage !== null);
  const result =
    page.lines.some((line) => /(?:目次|CONTENTS)/iu.test(line)) ||
    (chapterRows.length >= 2 && printedRows.length >= 2);
  return result;
}

function firstBodyHeadingCandidate(pages: PageText[]): ChapterCandidate | null {
  for (let index = 0; index < pages.length; index++) {
    if (isContentsLikePage(pages[index], index + 1)) continue;
    const candidate = bodyChapterCandidates(pages.slice(index, index + 1), 0)[0];
    if (candidate) return { ...candidate, pageNumber: index + 1 };
  }
  return null;
}

/**
 * Build an outline from OCR-positioned contents rows. This is needed for
 * scanned books whose OCR splits "第 1 章" across columns or pages. Printed
 * page numbers are used only to order the contents rows; destinations always
 * come from matching headings that actually exist in this PDF.
 */
function outlineFromContentsRows(pages: PageText[]): OutlineEntry[] | null {
  if (!pages.some((page) => page.items.some((item) => item.x > 20))) return null;

  const firstBodyHeading = firstBodyHeadingCandidate(pages);
  const bodyStart = firstBodyHeading ? firstBodyHeading.pageNumber - 1 : pages.length;
  const preBodyRows = pages
    .slice(0, bodyStart)
    .flatMap((page, index) => contentsRows(page.items, index + 1));
  const labeledContentsPage = pages
    .slice(0, bodyStart)
    .findIndex((page) => page.lines.some((line) => /(?:目次|CONTENTS)/iu.test(line)));
  const firstPrintedRootPage = preBodyRows.find((row) => {
    return (
      row.printedPage !== null &&
      (chapterNumberFromContentsRow(row) !== null || isUnnumberedChapterRow(row))
    );
  })?.sourcePage;
  const contentsStartPage =
    labeledContentsPage >= 0 ? labeledContentsPage + 1 : (firstPrintedRootPage ?? 1);
  const rows = preBodyRows.filter((row) => row.sourcePage >= contentsStartPage);
  const rootRows = rows.filter(
    (row) => chapterNumberFromContentsRow(row) !== null || isUnnumberedChapterRow(row),
  );
  if (rootRows.length < 2) return null;
  const lastContentsPage = Math.max(...rootRows.map((row) => row.sourcePage));

  const bodyCandidates = bodyChapterCandidates(pages, bodyStart);
  const bodyByChapter = new Map(bodyCandidates.map((candidate) => [candidate.key, candidate]));
  // The printed page is only a display value. OCR excerpts can begin in the
  // middle of a book, so sorting by it would move chapter 12 ahead of chapter
  // 2 when a page number was read from the wrong column. Source page/y is the
  // reliable reading order of the contents pages themselves.
  const orderedRows = rows
    .filter((row) => row.sourcePage <= lastContentsPage)
    .toSorted((left, right) => left.sourcePage - right.sourcePage || right.y - left.y);

  const roots: OutlineEntry[] = [];
  const rootByChapter = new Map<string, OutlineEntry>();
  const assignedChapterNumbers = new Map<ContentsRow, string>();
  let nextChapterNumber = 1;
  for (const row of orderedRows) {
    const explicitChapterNumber = chapterNumberFromContentsRow(row);
    const chapterNumber =
      explicitChapterNumber ?? (isUnnumberedChapterRow(row) ? String(nextChapterNumber) : null);
    if (!chapterNumber || rootByChapter.has(chapterNumber)) continue;
    assignedChapterNumbers.set(row, chapterNumber);
    nextChapterNumber = Math.max(nextChapterNumber, Number(chapterNumber) + 1);
    const body = bodyByChapter.get(chapterNumber);
    const root: OutlineEntry = {
      title: canonicalChapterTitle(row.title, chapterNumber),
      pageNumber: body?.pageNumber ?? null,
      children: [],
    };
    roots.push(root);
    rootByChapter.set(chapterNumber, root);
  }

  let currentRoot: OutlineEntry | null = null;
  let stack: Array<{ level: number; entry: OutlineEntry }> = [];
  for (const row of orderedRows) {
    const chapterNumber = assignedChapterNumbers.get(row) ?? null;
    if (chapterNumber) {
      currentRoot = rootByChapter.get(chapterNumber) ?? null;
      stack = [];
      continue;
    }
    if (!currentRoot || row.level === 0 || row.title === "索引") continue;

    const rootStart = currentRoot.pageNumber === null ? -1 : currentRoot.pageNumber - 1;
    const destination = rootStart >= 0 ? findPageContaining(pages, rootStart, row.title) : -1;
    const child: OutlineEntry = {
      title: row.title,
      pageNumber: destination >= 0 ? destination + 1 : null,
      children: [],
    };
    while (stack.length > 0 && stack.at(-1)!.level >= row.level) stack.pop();
    (stack.at(-1)?.entry ?? currentRoot).children.push(child);
    stack.push({ level: row.level, entry: child });
  }

  deduplicateOutline(roots);
  fillMissingPageNumbers(roots);
  return roots;
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

  const positionedOutline = outlineFromContentsRows(pages);
  if (positionedOutline) return positionedOutline;

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
    return sortOutlineByPage(entries);
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

  const outline = pool.reduce<OutlineEntry[]>((entries, candidate) => {
    if (seen.has(candidate.key)) return entries;
    seen.add(candidate.key);
    entries.push({ title: candidate.title, pageNumber: candidate.pageNumber, children: [] });
    return entries;
  }, []);

  return sortOutlineByPage(outline);
}
