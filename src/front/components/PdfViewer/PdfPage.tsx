import { useEffect, useRef, useState } from "react";
import { useAtomValue } from "jotai";
import { pdfScaleAtom } from "../../atoms/pdfAtom";
import type { PDFDocumentProxy } from "pdfjs-dist";

interface PdfPageProps {
  pdfDoc: PDFDocumentProxy;
  pageNumber: number;
}

export interface TextItemData {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

export function PdfPage({ pdfDoc, pageNumber }: PdfPageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const scale = useAtomValue(pdfScaleAtom);
  const [textItems, setTextItems] = useState<TextItemData[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function renderPage() {
      const page = await pdfDoc.getPage(pageNumber);
      const viewport = page.getViewport({ scale });

      // Render canvas
      const canvas = canvasRef.current;
      if (!canvas || cancelled) return;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      await page.render({ canvas, viewport }).promise;

      // Get text content for selection layer
      const textContent = await page.getTextContent();
      if (cancelled) return;

      const items: TextItemData[] = [];
      for (const item of textContent.items) {
        if ("str" in item && typeof item.str === "string" && item.str.trim()) {
          items.push({
            str: item.str,
            transform: item.transform as number[],
            width: item.width as number,
            height: item.height as number,
          });
        }
      }
      setTextItems(items);
    }

    // oxlint-disable-next-line no-restricted-imports
    renderPage();

    return () => {
      cancelled = true;
    };
  }, [pdfDoc, pageNumber, scale]);

  return (
    <div className="relative mb-4 shadow-lg mx-auto" style={{ width: "fit-content" }}>
      <canvas ref={canvasRef} className="block" />
      <div
        ref={textLayerRef}
        className="absolute top-0 left-0 select-text"
        style={{ pointerEvents: "auto", userSelect: "text" }}
      >
        {textItems.map((item, index) => {
          // pdf.js transform: [scaleX, skewX, skewY, scaleY, translateX, translateY]
          const [,,, sy, tx, ty] = item.transform;
          const fontSize = Math.abs(sy);
          // TranslateY is the baseline; we need top position
          const top = ty - fontSize;

          return (
            <span
              key={index}
              data-text-item-index={index}
              data-page-number={pageNumber}
              className="absolute whitespace-nowrap select-text"
              style={{
                left: `${tx}px`,
                top: `${top}px`,
                fontSize: `${fontSize}px`,
                fontFamily: "sans-serif",
                color: "transparent", // invisible but selectable
                lineHeight: "1",
              }}
            >
              {item.str}
            </span>
          );
        })}
      </div>
    </div>
  );
}
