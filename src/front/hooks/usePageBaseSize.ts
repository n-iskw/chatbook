// oxlint-disable-next-line no-restricted-imports -- pdf.js という命令的ライブラリからページの素の寸法を取り出すのに必要
import { useState, useEffect } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { PageSize } from "../lib/pageScale";

/**
 * How large a page is before anything is done to it, or nothing until pdf.js
 * has been asked.
 *
 * Deciding between one page and two needs this and cannot wait for the drawn
 * size to tell it: the drawn size is what the decision produces. pdf.js keeps
 * the pages it has handed out, so asking for one already on screen costs
 * nothing.
 */
export function usePageBaseSize(
  pdfDoc: PDFDocumentProxy | null,
  pageNumber: number,
): PageSize | null {
  const [size, setSize] = useState<PageSize | null>(null);

  useEffect(() => {
    if (!pdfDoc) {
      setSize(null);
      return;
    }

    let cancelled = false;
    pdfDoc
      .getPage(pageNumber)
      .then((page) => {
        if (cancelled) return;
        const base = page.getViewport({ scale: 1 });
        setSize({ baseWidth: base.width, baseHeight: base.height });
      })
      .catch(() => {
        // Not silence: PdfPage is asking pdf.js for the same page to draw it,
        // and a page that cannot be measured cannot be drawn either — the
        // reader hears about it from there. Keeping the last known size leaves
        // the layout as it was rather than folding it on the way past.
      });

    return () => {
      cancelled = true;
    };
  }, [pdfDoc, pageNumber]);

  return size;
}
