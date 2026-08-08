// oxlint-disable-next-line no-restricted-imports -- pdf.js の命令的な描画 API (RenderTask / TextLayer) のライフサイクル管理に必要
import { useEffect, useRef } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { pdfScaleAtom, pageViewportAtom } from "../../atoms/pdfAtom";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { pdfjsLib } from "../../lib/pdfjsConfig";

interface PdfPageProps {
  pdfDoc: PDFDocumentProxy;
  pageNumber: number;
}

export function PdfPage({ pdfDoc, pageNumber }: PdfPageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const scale = useAtomValue(pdfScaleAtom);
  const setViewport = useSetAtom(pageViewportAtom);

  useEffect(() => {
    let cancelled = false;

    async function renderPage() {
      const page = await pdfDoc.getPage(pageNumber);
      if (cancelled) return;

      const viewport = page.getViewport({ scale });
      setViewport({ width: viewport.width, height: viewport.height });

      const canvas = canvasRef.current;
      if (!canvas) return;

      // A canvas can only be in one render at a time. React StrictMode runs
      // effects twice, so cancel the in-flight task before starting a new one,
      // otherwise pdf.js throws and everything after it is skipped.
      renderTaskRef.current?.cancel();

      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;

      const task = page.render({ canvas, viewport });
      renderTaskRef.current = task;
      try {
        await task.promise;
      } catch (err) {
        // Cancelling is the normal path on re-render; anything else is real
        if ((err as { name?: string })?.name !== "RenderingCancelledException") throw err;
        return;
      }
      if (cancelled) return;

      const textLayerDiv = textLayerRef.current;
      if (!textLayerDiv) return;

      // pdf.js positions text spans relative to this custom property
      textLayerDiv.style.setProperty("--scale-factor", String(scale));
      textLayerDiv.style.width = `${viewport.width}px`;
      textLayerDiv.style.height = `${viewport.height}px`;
      textLayerDiv.replaceChildren();

      const textContent = await page.getTextContent();
      if (cancelled) return;

      const textLayer = new pdfjsLib.TextLayer({
        textContentSource: textContent,
        container: textLayerDiv,
        viewport,
      });
      await textLayer.render();
      if (cancelled) return;

      // pdfTextMatcher maps a DOM selection back to text item indices
      textLayer.textDivs.forEach((div, index) => {
        div.dataset.textItemIndex = String(index);
        div.dataset.pageNumber = String(pageNumber);
      });
    }

    renderPage().catch((err) => {
      console.error("Failed to render page:", err);
    });

    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
    };
  }, [pdfDoc, pageNumber, scale, setViewport]);

  return (
    <div className="relative mb-4 shadow-lg mx-auto" style={{ width: "fit-content" }}>
      <canvas ref={canvasRef} className="block" />
      <div ref={textLayerRef} className="textLayer" />
    </div>
  );
}
