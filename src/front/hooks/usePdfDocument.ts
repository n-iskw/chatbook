import { useState, useEffect, useRef } from "react";
import type * as pdfjsTypes from "pdfjs-dist";
import type { PdfDoc } from "../atoms/pdfAtom";
import { pdfjsLib, PDFJS_ASSET_OPTIONS } from "../lib/pdfjsConfig";
import { renderCoverThumbnail } from "../lib/pdfLoader";

/**
 * Books opened before covers existed have no thumbnail in storage. The reader
 * already holds the rendered document, so generate the cover here and store it
 * once; otherwise those books would stay blank on the shelf forever.
 */
async function backfillCover(pdfId: string, doc: pdfjsTypes.PDFDocumentProxy) {
  try {
    const book = await fetch(`/api/pdf/${pdfId}`).then((r) => (r.ok ? r.json() : null));
    if (!book || book.hasThumbnail) return;

    const thumbnail = await renderCoverThumbnail(doc);
    if (!thumbnail) return;

    await fetch(`/api/pdf/${pdfId}/thumbnail`, {
      method: "PUT",
      headers: { "Content-Type": "image/webp" },
      body: thumbnail,
    });
  } catch (err) {
    console.warn("Failed to backfill the book cover (non-critical):", err);
  }
}

/**
 * Load the pdfjs-dist PDFDocumentProxy for the given book by fetching the
 * stored PDF binary from the API.
 */
export function usePdfDocument(pdfDoc: PdfDoc | null) {
  const [pdfDocument, setPdfDocument] = useState<pdfjsTypes.PDFDocumentProxy | null>(null);
  const loadingRef = useRef<string | null>(null);

  useEffect(() => {
    if (!pdfDoc) {
      setPdfDocument(null);
      return;
    }

    // Don't reload if already loaded for this doc id
    if (loadingRef.current === pdfDoc.id && pdfDocument) return;
    loadingRef.current = pdfDoc.id;

    const pdfId = pdfDoc.id;
    let cancelled = false;

    async function loadPdf() {
      try {
        const response = await fetch(`/api/pdf/${pdfId}/file`);
        if (!response.ok) {
          console.warn("PDF file not found on server, rendering unavailable");
          return;
        }
        const arrayBuffer = await response.arrayBuffer();
        if (cancelled) return;

        const doc = await pdfjsLib.getDocument({
          data: arrayBuffer,
          ...PDFJS_ASSET_OPTIONS,
        }).promise;
        if (cancelled) return;

        setPdfDocument(doc);
        void backfillCover(pdfId, doc);
      } catch (err) {
        console.error("Failed to load PDF for rendering:", err);
      }
    }

    loadPdf();

    return () => {
      cancelled = true;
    };
  }, [pdfDoc?.id]);

  return { pdfDocument };
}
