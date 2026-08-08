// oxlint-disable-next-line no-restricted-imports -- pdf.js の getOutline を呼び、dest をページ番号へ解決する非同期処理に必要
import { useState, useEffect } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";

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
 * Read the PDF's bookmarks (table of contents) and resolve each entry to a page.
 * Returns an empty array for PDFs that ship without an outline.
 */
export function usePdfOutline(doc: PDFDocumentProxy | null) {
  const [outline, setOutline] = useState<OutlineEntry[] | null>(null);

  useEffect(() => {
    if (!doc) {
      setOutline(null);
      return;
    }

    let cancelled = false;
    doc
      .getOutline()
      .then(async (items) => {
        const entries = items ? await toEntries(doc, items) : [];
        if (!cancelled) setOutline(entries);
      })
      .catch(() => {
        if (!cancelled) setOutline([]);
      });

    return () => {
      cancelled = true;
    };
  }, [doc]);

  return { outline };
}
