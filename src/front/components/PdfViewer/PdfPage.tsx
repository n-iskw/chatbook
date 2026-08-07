import { useEffect, useRef } from "react";
import { useAtomValue } from "jotai";
import { pdfScaleAtom } from "../../atoms/pdfAtom";
import type { PDFDocumentProxy } from "pdfjs-dist";

interface PdfPageProps {
  pdfDoc: PDFDocumentProxy;
  pageNumber: number;
}

export function PdfPage({ pdfDoc, pageNumber }: PdfPageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scale = useAtomValue(pdfScaleAtom);

  useEffect(() => {
    let cancelled = false;

    async function renderPage() {
      const page = await pdfDoc.getPage(pageNumber);
      const viewport = page.getViewport({ scale });

      const canvas = canvasRef.current;
      if (!canvas || cancelled) return;

      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;

      await page.render({ canvas, viewport }).promise;
    }

    // oxlint-disable-next-line no-restricted-imports -- canvas rendering must run after mount
    renderPage();

    return () => {
      cancelled = true;
    };
  }, [pdfDoc, pageNumber, scale]);

  return (
    <div className="mb-4 shadow-lg mx-auto" style={{ width: "fit-content" }}>
      <canvas ref={canvasRef} className="block" />
    </div>
  );
}
