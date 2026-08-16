import { useRef } from "react";
import { useOpenPdfBook } from "../../hooks/useOpenPdfBook";
import type { ExtractedPdfData } from "../../lib/pdfLoader";

interface FileSelectorProps {
  /** Called with the book id once the upload finished, so the caller can navigate. */
  onOpened?: (pdfId: string) => void;
  /**
   * Called with the reason a chosen file did not become a book. This component
   * has nowhere of its own to show it — it lives in a header next to a button —
   * so the page it sits on decides where the reader reads it.
   */
  onError?: (message: string) => void;
  label?: string;
  className?: string;
  /** Reads the text and cover out of the chosen file; injectable for tests. */
  extract?: (file: File) => Promise<ExtractedPdfData>;
}

export function FileSelector({
  onOpened,
  onError,
  label = "PDFを開く",
  className,
  extract,
}: FileSelectorProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const openFile = useOpenPdfBook(extract);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const outcome = await openFile(file);
    // Allow selecting the same file again
    e.target.value = "";

    outcome.match(
      (pdfId) => onOpened?.(pdfId),
      (failure) => onError?.(`PDFを開けませんでした: ${failure.message}`),
    );
  };

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className={
          className ??
          "px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium transition-colors cursor-pointer"
        }
      >
        {label}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        onChange={handleFileChange}
        className="hidden"
      />
    </>
  );
}
