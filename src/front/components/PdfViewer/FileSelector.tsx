import { useRef } from "react";
import { useAtom } from "jotai";
import { pdfDocAtom, pdfStatusAtom, pdfErrorAtom } from "../../atoms/pdfAtom";
import { extractPdfData } from "../../lib/pdfLoader";
import { fetcher } from "../../lib/fetcher";

export function FileSelector() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [, setPdfDoc] = useAtom(pdfDocAtom);
  const [, setPdfStatus] = useAtom(pdfStatusAtom);
  const [, setPdfError] = useAtom(pdfErrorAtom);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setPdfStatus("loading");
    setPdfError(null);

    try {
      // Extract text client-side (pdf.js)
      const extracted = await extractPdfData(file);

      // Send as multipart/form-data (avoids base64 overhead)
      const formData = new FormData();
      formData.append("file", file);
      formData.append("fullText", extracted.fullText);
      formData.append("pageCount", String(extracted.pageCount));

      const result = await fetcher<{
        id: string;
        fileName: string;
        pageCount: number;
        fullText: string;
      }>("/api/pdf/open", {
        method: "POST",
        body: formData,
      });

      setPdfDoc({
        id: result.id,
        fileName: result.fileName,
        pageCount: result.pageCount,
        fullText: result.fullText,
      });
      setPdfStatus("ready");
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : "Failed to load PDF");
      setPdfStatus("error");
    }
  };

  return (
    <div className="flex items-center gap-3 p-3 border-b border-gray-200 bg-white">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium transition-colors cursor-pointer"
      >
        PDFを開く
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  );
}
