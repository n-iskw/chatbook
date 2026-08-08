import { useAtom, useAtomValue } from "jotai";
import {
  chatMessagesAtom,
  streamingContentAtom,
  isStreamingAtom,
  useWebSearchAtom,
  activeSelectionAtom,
} from "../../atoms/chatAtom";
import { pdfDocAtom } from "../../atoms/pdfAtom";
import { ChatMessageList } from "./ChatMessageList";
import { ChatInput } from "./ChatInput";
import { useChatStream } from "../../hooks/useChatStream";

export function ChatArea() {
  const pdfDoc = useAtomValue(pdfDocAtom);
  const [activeSelection, setActiveSelection] = useAtom(activeSelectionAtom);
  const messages = useAtomValue(chatMessagesAtom);
  const streamingContent = useAtomValue(streamingContentAtom);
  const isStreaming = useAtomValue(isStreamingAtom);
  const useWebSearch = useAtomValue(useWebSearchAtom);

  const { sendMessage } = useChatStream();

  const handleSend = async (content: string) => {
    if (!pdfDoc || !activeSelection) return;
    await sendMessage(pdfDoc.id, activeSelection.id, content, useWebSearch);
  };

  if (!pdfDoc) {
    return (
      <div className="flex items-center justify-center h-full bg-white">
        <p className="text-gray-400 text-sm">PDFを開いてテキストを選択してください</p>
      </div>
    );
  }

  if (!activeSelection) {
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
      <ChatMessageList
        messages={messages}
        streamingContent={streamingContent}
        isStreaming={isStreaming}
      />
      <ChatInput
        onSend={handleSend}
        disabled={isStreaming}
        quotedText={activeSelection.selectedText}
        onClearQuote={() => setActiveSelection(null)}
      />
    </div>
  );
}
