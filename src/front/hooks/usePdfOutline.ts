// oxlint-disable-next-line no-restricted-imports -- pdf.js の getOutline を呼び、dest をページ番号へ解決する非同期処理に必要
import { useState, useEffect } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { readOutlineEntries, type OutlineEntry } from "../lib/pdfOutline";

export type { OutlineEntry } from "../lib/pdfOutline";

/**
 * Read the PDF's bookmarks (table of contents) and resolve each entry to a page.
 * Returns an empty array for PDFs that ship without an outline.
 *
 * A read that failed is kept apart from a book that has no bookmarks: both used
 * to end as an empty list, so a reader could not tell "this book has no table
 * of contents" from "the one it has could not be read".
 */
export function usePdfOutline(doc: PDFDocumentProxy | null) {
  const [outline, setOutline] = useState<OutlineEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!doc) {
      setOutline(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setError(null);
    readOutlineEntries(doc)
      .then((entries) => {
        if (!cancelled) setOutline(entries);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      });

    return () => {
      cancelled = true;
    };
  }, [doc]);

  return { outline, error };
}
