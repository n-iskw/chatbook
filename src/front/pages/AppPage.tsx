import { useState, useEffect, useCallback } from "react";
import { useAtomValue, useAtom } from "jotai";
import { pdfDocAtom, currentPageAtom } from "../atoms/pdfAtom";
import { activeSelectionIdAtom, chatMessagesAtom, type Citation } from "../atoms/chatAtom";
import { PdfViewer } from "../components/PdfViewer/PdfViewer";
import { ChatArea } from "../components/ChatArea/ChatArea";
import { fetcher } from "../lib/fetcher";

export function AppPage() {
  const pdfDoc = useAtomValue(pdfDocAtom);
  const [, setActiveSelectionId] = useAtom(activeSelectionIdAtom);
  const [, setChatMessages] = useAtom(chatMessagesAtom);
  const [, setCurrentPage] = useAtom(currentPageAtom);
  const [leftWidth, setLeftWidth] = useState(60);

  // Listen for citation jump events
  useEffect(() => {
    const handleCitationJump = (e: Event) => {
      const detail = (e as CustomEvent<{ pageNumber: number; text: string }>).detail;
      setCurrentPage(detail.pageNumber);
    };
    window.addEventListener("citation:jump", handleCitationJump);
    return () => window.removeEventListener("citation:jump", handleCitationJump);
  }, [setCurrentPage]);

  // Load chat history when selection changes
  const handleSelectionClick = useCallback(
    async (selectionId: string) => {
      setActiveSelectionId(selectionId);
      if (!pdfDoc) return;

      try {
        const data = await fetcher<{
          selectionId: string;
          messages: {
            id: string;
            role: string;
            content: string;
            citations?: Citation[];
            createdAt: string;
          }[];
        }>(`/api/pdf/${pdfDoc.id}/selections/${selectionId}/chats`);

        setChatMessages(
          data.messages.map((m) => ({
            id: m.id,
            role: m.role as "user" | "assistant",
            content: m.content,
            citations: m.citations,
            createdAt: m.createdAt,
          })),
        );
      } catch {
        setChatMessages([]);
      }
    },
    [pdfDoc, setActiveSelectionId, setChatMessages],
  );

  return (
    <div className="h-screen flex flex-col bg-white">
      <header className="flex items-center h-12 px-4 border-b border-gray-200 bg-gray-50 shrink-0">
        <h1 className="text-lg font-bold text-gray-800">chatbook</h1>
        {pdfDoc && (
          <span className="ml-3 text-sm text-gray-500 truncate max-w-xs">
            {pdfDoc.fileName}
          </span>
        )}
      </header>
      <main className="flex-1 min-h-0 flex">
        {/* Left panel: PDF Viewer */}
        <div style={{ width: `${leftWidth}%` }} className="h-full min-w-0">
          <PdfViewer onSelectionClick={handleSelectionClick} />
        </div>

        {/* Resize handle */}
        <div
          className="w-1.5 bg-gray-200 hover:bg-blue-400 cursor-col-resize shrink-0 transition-colors active:bg-blue-500"
          onMouseDown={(e) => {
            e.preventDefault();
            const startX = e.clientX;
            const startWidth = leftWidth;

            const handleMouseMove = (moveEvent: MouseEvent) => {
              const delta = ((moveEvent.clientX - startX) / window.innerWidth) * 100;
              const newWidth = Math.min(80, Math.max(20, startWidth + delta));
              setLeftWidth(newWidth);
            };

            const handleMouseUp = () => {
              document.removeEventListener("mousemove", handleMouseMove);
              document.removeEventListener("mouseup", handleMouseUp);
            };

            document.addEventListener("mousemove", handleMouseMove);
            document.addEventListener("mouseup", handleMouseUp);
          }}
        />

        {/* Right panel: Chat Area */}
        <div style={{ width: `${100 - leftWidth}%` }} className="h-full min-w-0">
          <ChatArea />
        </div>
      </main>
    </div>
  );
}
