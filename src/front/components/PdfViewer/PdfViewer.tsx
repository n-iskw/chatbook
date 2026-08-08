// oxlint-disable-next-line no-restricted-imports -- 本の切り替えに合わせたハイライト読み直しと、表示幅の ResizeObserver 購読に必要
import { useRef, useState, useCallback, useEffect } from "react";
import { useAtomValue, useAtom } from "jotai";
import {
  pdfDocAtom,
  pdfStatusAtom,
  pdfErrorAtom,
  currentPageAtom,
  pageViewportAtom,
  outlineOpenAtom,
} from "../../atoms/pdfAtom";
import {
  activeSelectionAtom,
  chatMessagesAtom,
  useWebSearchAtom,
  type ActiveSelection,
} from "../../atoms/chatAtom";
import { PdfPage } from "./PdfPage";
import { PdfOutline } from "./PdfOutline";
import { SelectionPopover } from "./SelectionPopover";
import { HighlightOverlay } from "./HighlightOverlay";
import { getSelectionFromTextLayer } from "../../lib/pdfTextMatcher";
import { usePdfDocument } from "../../hooks/usePdfDocument";
import { usePdfOutline } from "../../hooks/usePdfOutline";
import { useKeyboardShortcuts } from "../../hooks/useKeyboardShortcuts";
import { useChatStream } from "../../hooks/useChatStream";
import type { ViewerAction } from "../../lib/keybindings";
import { fetcher } from "../../lib/fetcher";

interface PdfViewerProps {
  onSelectionClick: (selection: ActiveSelection) => void;
}

interface HighlightData {
  id: string;
  selectedText: string;
  pageNumber: number;
  positionData: {
    rects: { x: number; y: number; width: number; height: number }[];
    pageWidth?: number;
  };
  color: string;
}

const HIGHLIGHT_COLORS = [
  "#FFEB3B",
  "#FF9800",
  "#4CAF50",
  "#2196F3",
  "#9C27B0",
  "#F44336",
  "#00BCD4",
  "#FF5722",
];

export function PdfViewer({ onSelectionClick }: PdfViewerProps) {
  const pdfDoc = useAtomValue(pdfDocAtom);
  const status = useAtomValue(pdfStatusAtom);
  const error = useAtomValue(pdfErrorAtom);
  const [currentPage, setCurrentPage] = useAtom(currentPageAtom);
  const [, setActiveSelection] = useAtom(activeSelectionAtom);
  const [, setChatMessages] = useAtom(chatMessagesAtom);
  const useWebSearch = useAtomValue(useWebSearchAtom);
  const viewport = useAtomValue(pageViewportAtom);
  const containerRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);

  const [popoverState, setPopoverState] = useState<{
    position: { x: number; y: number; width: number };
    selectedText: string;
    selectionPosition: {
      startIndex: number;
      endIndex: number;
      pageNumber: number;
      rects: { x: number; y: number; width: number; height: number }[];
      pageWidth: number;
    };
  } | null>(null);

  const [highlights, setHighlights] = useState<HighlightData[]>([]);
  const [contentWidth, setContentWidth] = useState(0);

  const [outlineOpen, setOutlineOpen] = useAtom(outlineOpenAtom);

  const { pdfDocument } = usePdfDocument(pdfDoc);
  const { outline } = usePdfOutline(pdfDocument);
  const { sendMessage } = useChatStream();

  const pageCount = pdfDoc?.pageCount ?? 1;
  const handleShortcut = useCallback(
    (action: ViewerAction) => {
      switch (action) {
        case "nextPage":
          setCurrentPage((page) => Math.min(pageCount, page + 1));
          break;
        case "prevPage":
          setCurrentPage((page) => Math.max(1, page - 1));
          break;
        case "firstPage":
          setCurrentPage(1);
          break;
        case "lastPage":
          setCurrentPage(pageCount);
          break;
        case "toggleOutline":
          setOutlineOpen((open) => !open);
          break;
      }
    },
    [pageCount, setCurrentPage, setOutlineOpen],
  );
  useKeyboardShortcuts(handleShortcut);

  // Render the page at whatever width the panel currently has, so dragging the
  // splitter resizes the PDF instead of clipping it.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let frame = 0;
    const observer = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setContentWidth(width));
    });
    observer.observe(container);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [pdfDocument]);

  // Load highlights when PDF changes
  useEffect(() => {
    if (!pdfDoc) return;
    let cancelled = false;
    fetcher<{
      selections: {
        id: string;
        selectedText: string;
        pageNumber: number;
        positionData: {
          rects: { x: number; y: number; width: number; height: number }[];
          pageWidth?: number;
        };
        color: string;
      }[];
    }>(`/api/pdf/${pdfDoc.id}`)
      .then((data) => {
        if (!cancelled) {
          setHighlights(
            data.selections.map((s, i) => ({
              id: s.id,
              selectedText: s.selectedText,
              pageNumber: s.pageNumber,
              positionData: s.positionData,
              color: s.color || HIGHLIGHT_COLORS[i % HIGHLIGHT_COLORS.length],
            })),
          );
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [pdfDoc]);

  const handleMouseUp = useCallback(() => {
    setTimeout(() => {
      const result = getSelectionFromTextLayer();
      if (!result) {
        // Don't clear popover if clicking a highlight
        return;
      }

      const selection = window.getSelection();
      if (!selection || !selection.rangeCount) return;

      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      // Highlights are placed inside the page element, so measure against it
      // rather than the scroll container (which drifts as the user scrolls).
      const pageEl = pageRef.current;
      if (!pageEl) return;
      const pageRect = pageEl.getBoundingClientRect();

      const position = {
        x: rect.left - pageRect.left,
        y: rect.top - pageRect.top,
        width: rect.width,
      };

      setPopoverState({
        position,
        selectedText: result.text,
        selectionPosition: {
          startIndex: result.startIndex,
          endIndex: result.endIndex,
          pageNumber: result.pageNumber,
          rects: [{ ...position, height: rect.height }],
          // Rects are page pixels; without the width they were measured at,
          // the highlight would drift once the page is rendered at another size
          pageWidth: pageRect.width,
        },
      });
    }, 10);
  }, []);

  const handlePopoverSubmit = useCallback(
    async (question: string) => {
      if (!popoverState || !pdfDoc) return;
      setPopoverState(null);

      try {
        const selection = await fetcher<{
          id: string;
          selectedText: string;
          pageNumber: number;
          positionData: { rects: { x: number; y: number; width: number; height: number }[] };
          createdAt: string;
        }>(`/api/pdf/${pdfDoc.id}/selections`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            selectedText: popoverState.selectedText,
            pageNumber: popoverState.selectionPosition.pageNumber,
            positionData: popoverState.selectionPosition,
          }),
        });

        // Add highlight
        const colorIdx = highlights.length % HIGHLIGHT_COLORS.length;
        setHighlights((prev) => [
          ...prev,
          {
            id: selection.id,
            selectedText: selection.selectedText,
            pageNumber: selection.pageNumber,
            positionData: selection.positionData,
            color: HIGHLIGHT_COLORS[colorIdx],
          },
        ]);

        // Open the chat for this selection, then stream the answer into it.
        // Going through sendMessage is what shows the question immediately and
        // renders the answer as it arrives.
        setActiveSelection({
          id: selection.id,
          selectedText: selection.selectedText,
          pageNumber: selection.pageNumber,
        });
        setChatMessages([]);
        await sendMessage(pdfDoc.id, selection.id, question, useWebSearch);
      } catch (err) {
        console.error("Failed to create selection:", err);
      }
    },
    [
      popoverState,
      pdfDoc,
      highlights.length,
      useWebSearch,
      setActiveSelection,
      setChatMessages,
      sendMessage,
    ],
  );

  const handlePopoverDismiss = useCallback(() => {
    setPopoverState(null);
    window.getSelection()?.removeAllRanges();
  }, []);

  const handleHighlightClick = useCallback(
    (selectionId: string) => {
      const hl = highlights.find((h) => h.id === selectionId);
      if (!hl) return;

      onSelectionClick({
        id: hl.id,
        selectedText: hl.selectedText,
        pageNumber: hl.pageNumber,
      });
      setCurrentPage(hl.pageNumber);
    },
    [onSelectionClick, highlights, setCurrentPage],
  );

  return (
    <div className="flex flex-col h-full bg-gray-100" onMouseUp={handleMouseUp}>
      {status === "loading" && (
        <div className="flex items-center justify-center flex-1">
          <div className="text-gray-500 text-lg">PDFを読み込み中...</div>
        </div>
      )}

      {status === "error" && (
        <div className="flex items-center justify-center flex-1">
          <div className="text-red-500 text-lg">エラーが発生しました: {error}</div>
        </div>
      )}

      {status === "idle" && !pdfDoc && (
        <div className="flex items-center justify-center flex-1">
          <div className="text-gray-400 text-lg">PDFファイルを選択してください</div>
        </div>
      )}

      {pdfDocument && (
        <div className="flex min-h-0 flex-1">
          {outlineOpen && (
            <PdfOutline outline={outline} currentPage={currentPage} onJump={setCurrentPage} />
          )}

          <div ref={containerRef} className="flex-1 overflow-auto p-4">
            <div ref={pageRef} className="relative mx-auto" style={{ width: "fit-content" }}>
              {contentWidth > 0 && (
                <PdfPage
                  pdfDoc={pdfDocument}
                  pageNumber={currentPage}
                  containerWidth={contentWidth}
                />
              )}
              <HighlightOverlay
                highlights={highlights}
                pageNumber={currentPage}
                containerWidth={viewport.width}
                containerHeight={viewport.height}
                basePageWidth={viewport.baseWidth}
                onHighlightClick={handleHighlightClick}
              />

              {popoverState && (
                <div
                  className="absolute z-50 w-80"
                  style={{
                    // Centre on the selection, keep it inside the page, and sit
                    // just above the selected line.
                    left: Math.min(
                      Math.max(0, popoverState.position.x + popoverState.position.width / 2 - 160),
                      Math.max(0, viewport.width - 320),
                    ),
                    top: Math.max(0, popoverState.position.y - 130),
                  }}
                >
                  <SelectionPopover
                    onSubmit={handlePopoverSubmit}
                    onDismiss={handlePopoverDismiss}
                  />
                </div>
              )}
            </div>

            {pdfDoc && (
              <div className="flex items-center justify-center gap-4 py-4">
                <button
                  type="button"
                  onClick={() => setOutlineOpen((open) => !open)}
                  aria-pressed={outlineOpen}
                  className="px-3 py-1 bg-white border rounded cursor-pointer text-sm text-gray-600 hover:bg-gray-50"
                >
                  {outlineOpen ? "目次を隠す" : "目次を表示"}
                </button>
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
        </div>
      )}
    </div>
  );
}
