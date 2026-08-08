import { useAtomValue } from "jotai";
import { chatMessagesAtom, streamingContentAtom, isStreamingAtom, useWebSearchAtom } from "../../atoms/chatAtom";
import { activeSelectionIdAtom } from "../../atoms/chatAtom";
import { pdfDocAtom } from "../../atoms/pdfAtom";
import { ChatMessageList } from "./ChatMessageList";
import { ChatInput } from "./ChatInput";
import { useChatStream } from "../../hooks/useChatStream";
import { useAtom } from "jotai";

export function ChatArea() {
  const pdfDoc = useAtomValue(pdfDocAtom);
  const activeSelectionId = useAtomValue(activeSelectionIdAtom);
  const messages = useAtomValue(chatMessagesAtom);
  const streamingContent = useAtomValue(streamingContentAtom);
  const isStreaming = useAtomValue(isStreamingAtom);
  const [useWebSearch, setUseWebSearch] = useAtom(useWebSearchAtom);

  const { sendMessage } = useChatStream();

  const handleSend = async (content: string) => {
    if (!pdfDoc || !activeSelectionId) return;
    await sendMessage(pdfDoc.id, activeSelectionId, content, useWebSearch);
  };

  if (!pdfDoc) {
    return (
      <div className="flex items-center justify-center h-full bg-white">
        <p className="text-gray-400 text-sm">PDFを開いてテキストを選択してください</p>
      </div>
    );
  }

  if (!activeSelectionId) {
    return (
      <div className="flex items-center justify-center h-full bg-white">
        <div className="text-center">
          <p className="text-gray-500 text-sm font-medium mb-1">チャットを開始するには</p>
          <p className="text-gray-400 text-sm">PDF内のテキストを選択して質問してください</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="p-3 border-b border-gray-200 bg-gray-50 shrink-0">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-gray-700 truncate">
            {pdfDoc.fileName}
          </h2>
          <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={useWebSearch}
              onChange={(e) => setUseWebSearch(e.target.checked)}
              className="w-3.5 h-3.5"
            />
            Web検索
          </label>
        </div>
      </div>
      <ChatMessageList
        messages={messages}
        streamingContent={streamingContent}
        isStreaming={isStreaming}
      />
      <ChatInput onSend={handleSend} disabled={isStreaming} />
    </div>
  );
}
