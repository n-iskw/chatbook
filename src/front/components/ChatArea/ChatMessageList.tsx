// oxlint-disable-next-line no-restricted-imports -- 新着メッセージとストリーム更新に追随して最下部へスクロールするために必要
import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "../../../shared/schemas/chat";
import { ChatMessageBubble } from "./ChatMessageBubble";
import {
  readChatQuoteFromWindow,
  type ChatQuoteSelection,
  type ReadChatQuote,
} from "../../lib/chatQuoteSelection";

interface ChatMessageListProps {
  messages: ChatMessage[];
  streamingContent: string;
  isStreaming: boolean;
  /** Takes the passage the reader picked out of the thread to ask about. */
  onQuote: (text: string) => void;
  /**
   * Reads what the drag selected. Injectable because a real one needs laid-out
   * text under a real Selection, and jsdom has neither; this is the seam the
   * offer and what it hands over are tested through.
   */
  readQuote?: ReadChatQuote;
}

export function ChatMessageList({
  messages,
  streamingContent,
  isStreaming,
  onQuote,
  readQuote = readChatQuoteFromWindow,
}: ChatMessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const [quotable, setQuotable] = useState<ChatQuoteSelection | null>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  const handleMouseUp = () => {
    // A drag that selected nothing takes the offer away with it: leaving it up
    // would quote a passage the reader has already deselected.
    setQuotable(threadRef.current ? readQuote(threadRef.current) : null);
  };

  return (
    <div ref={threadRef} className="flex-1 overflow-y-auto p-3 space-y-3" onMouseUp={handleMouseUp}>
      {messages.map((msg) => (
        <ChatMessageBubble key={msg.id} message={msg} />
      ))}

      {isStreaming && streamingContent && (
        <ChatMessageBubble
          message={{
            role: "assistant",
            content: streamingContent,
          }}
        />
      )}

      {isStreaming && !streamingContent && (
        <div className="flex items-center gap-2 py-2" role="status">
          <div className="flex gap-1">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce [animation-delay:0ms]" />
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce [animation-delay:150ms]" />
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce [animation-delay:300ms]" />
          </div>
          <span className="text-xs text-gray-500">考え中…</span>
        </div>
      )}

      <div ref={bottomRef} />

      {quotable !== null && (
        <button
          type="button"
          // Pressing a button clears the selection before the click lands, and
          // with it the passage this offer is about
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            onQuote(quotable.text);
            setQuotable(null);
            // The passage is in the quote box now. Left selected, the browser
            // would treat a drag over it as a drag-and-drop of the text, so
            // the reader could not pick it out a second time.
            window.getSelection()?.removeAllRanges();
          }}
          // Placed against the viewport, so it stays over the passage no matter
          // how far the thread is scrolled
          style={{
            position: "fixed",
            top: quotable.rect.top,
            left: quotable.rect.left + quotable.rect.width / 2,
          }}
          className="z-20 -translate-x-1/2 -translate-y-full cursor-pointer rounded-md bg-gray-800 px-2 py-1 text-xs text-white shadow-lg hover:bg-gray-700"
        >
          引用して質問
        </button>
      )}
    </div>
  );
}
