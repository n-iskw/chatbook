// pdf.js is only ever named as a type here: the document comes in as an
// argument, so no value import exists to smuggle in a non-legacy build past
// pdfjsConfig.ts.
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { BookOutline } from "../../shared/schemas/book";

export interface OutlineEntry {
  title: string;
  /** null when the destination cannot be resolved to a page */
  pageNumber: number | null;
  children: OutlineEntry[];
}

type RawOutlineItem = Awaited<ReturnType<PDFDocumentProxy["getOutline"]>>[number];

/**
 * Resolve an outline destination to a 1-based page number.
 * A destination is either a name that has to be looked up, or an explicit
 * array whose first element is a page reference.
 */
async function resolvePageNumber(
  doc: PDFDocumentProxy,
  dest: RawOutlineItem["dest"],
): Promise<number | null> {
  try {
    const explicit = typeof dest === "string" ? await doc.getDestination(dest) : dest;
    if (!Array.isArray(explicit) || explicit.length === 0) return null;
    return (
      (await doc.getPageIndex(explicit[0] as Parameters<PDFDocumentProxy["getPageIndex"]>[0])) + 1
    );
  } catch {
    // One bookmark pointing at nothing is not a broken table of contents: the
    // entry is listed without a page and cannot be jumped to, while the rest
    // of the outline stays usable.
    return null;
  }
}

async function toEntries(doc: PDFDocumentProxy, items: RawOutlineItem[]): Promise<OutlineEntry[]> {
  return Promise.all(
    items.map(async (item) => ({
      title: item.title,
      pageNumber: await resolvePageNumber(doc, item.dest),
      children: item.items?.length ? await toEntries(doc, item.items as RawOutlineItem[]) : [],
    })),
  );
}

/**
 * Read the PDF's bookmarks (table of contents) and resolve each entry to a
 * page. Returns an empty array for PDFs that ship without an outline; a read
 * that fails rejects, and what that means is the caller's to decide (the
 * outline panel reports it, the upload path shrugs it off).
 */
export async function readOutlineEntries(doc: PDFDocumentProxy): Promise<OutlineEntry[]> {
  const items = await doc.getOutline();
  return items ? await toEntries(doc, items) : [];
}

/**
 * The shape the server stores: top-level chapters only, each with the page it
 * starts on. Chapter bounds are all the server cuts chat excerpts by, so the
 * nesting stays client-side. Entries whose destination never resolved carry
 * no page and are dropped; when nothing survives, null — the book is stored
 * as having no outline and chat falls back to a page window.
 */
export function toStoredOutline(entries: OutlineEntry[]): BookOutline | null {
  const chapters = entries
    .filter((entry): entry is OutlineEntry & { pageNumber: number } => entry.pageNumber !== null)
    .map(({ title, pageNumber }) => ({ title, pageNumber }));
  return chapters.length > 0 ? chapters : null;
}
