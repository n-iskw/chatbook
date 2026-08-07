import { useState, useEffect, useRef } from "react";
import * as pdfjsLib from "pdfjs-dist";
import type { PdfDoc } from "../atoms/pdfAtom";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.mjs",
  import.meta.url,
).toString();

/**
 * Load the pdfjs-dist PDFDocumentProxy from the stored server-side PDF content.
 * The PdfDoc contains metadata (id, fileName, pageCount, fullText).
 * We re-load the PDF document from the file hash for rendering.
 */
export function usePdfDocument(pdfDoc: PdfDoc | null) {
  const [pdfDocument, setPdfDocument] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const loadingRef = useRef<string | null>(null);

  useEffect(() => {
    if (!pdfDoc) {
      setPdfDocument(null);
      return;
    }

    // Don't reload if already loaded for this doc id
    if (loadingRef.current === pdfDoc.id && pdfDocument) return;
    loadingRef.current = pdfDoc.id;

    let cancelled = false;

    async function loadPdf() {
      try {
        // Fetch the PDF file from the API (the saved file on disk)
        const response = await fetch(`/api/pdf/${pdfDoc!.id}/file`);
        if (!response.ok) {
          // Fallback: re-upload needed, but for now just skip rendering
          console.warn("PDF file not found on server, rendering unavailable");
          return;
        }
        const arrayBuffer = await response.arrayBuffer();
        if (cancelled) return;
        const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        if (!cancelled) {
          setPdfDocument(doc);
        }
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
