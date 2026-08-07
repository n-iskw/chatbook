import { useRef } from "react";
import { useAtomValue, useAtom } from "jotai";
import { pdfDocAtom, pdfStatusAtom, pdfErrorAtom, currentPageAtom } from "../../atoms/pdfAtom";
import { FileSelector } from "./FileSelector";
import { PdfPage } from "./PdfPage";
import { usePdfDocument } from "../../hooks/usePdfDocument";

export function PdfViewer() {
  const pdfDoc = useAtomValue(pdfDocAtom);
  const status = useAtomValue(pdfStatusAtom);
  const error = useAtomValue(pdfErrorAtom);
  const [currentPage, setCurrentPage] = useAtom(currentPageAtom);
  const containerRef = useRef<HTMLDivElement>(null);

  const { pdfDocument } = usePdfDocument(pdfDoc);

  return (
    <div className="flex flex-col h-full bg-gray-100">
      <FileSelector />

      {status === "loading" && (
        <div className="flex items-center justify-center flex-1">
          <div className="text-gray-500 text-lg">PDFを読み込み中...</div>
        </div>
      )}

      {status === "error" && (
        <div className="flex items-center justify-center flex-1">
          <div className="text-red-500 text-lg">
            エラーが発生しました: {error}
          </div>
        </div>
      )}

      {status === "idle" && !pdfDoc && (
        <div className="flex items-center justify-center flex-1">
          <div className="text-gray-400 text-lg">
            PDFファイルを選択してください
          </div>
        </div>
      )}

      {pdfDocument && (
        <div ref={containerRef} className="flex-1 overflow-auto p-4">
          <PdfPage pdfDoc={pdfDocument} pageNumber={currentPage} />
          {pdfDoc && (
            <div className="flex items-center justify-center gap-4 py-4">
              <button
                type="button"
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage <= 1}
                className="px-3 py-1 bg-white border rounded disabled:opacity-30 cursor-pointer"
              >
                前へ
              </button>
              <span className="text-sm text-gray-600">
                {currentPage} / {pdfDoc.pageCount}
              </span>
              <button
                type="button"
                onClick={() => setCurrentPage(Math.min(pdfDoc.pageCount, currentPage + 1))}
                disabled={currentPage >= pdfDoc.pageCount}
                className="px-3 py-1 bg-white border rounded disabled:opacity-30 cursor-pointer"
              >
                次へ
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
