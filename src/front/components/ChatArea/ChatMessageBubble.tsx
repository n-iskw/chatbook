import type { ChatMessage } from "../../atoms/chatAtom";
import { CitationBadge } from "./CitationBadge";

interface ChatMessageBubbleProps {
  message: ChatMessage;
}

export function ChatMessageBubble({ message }: ChatMessageBubbleProps) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
          isUser
            ? "bg-blue-600 text-white rounded-br-sm"
            : "bg-gray-100 text-gray-800 rounded-bl-sm"
        }`}
      >
        <div className="whitespace-pre-wrap break-words">{message.content}</div>

        {!isUser && message.citations && message.citations.length > 0 && (
          <div className="mt-2 pt-2 border-t border-gray-200">
            <p className="text-xs text-gray-500 mb-1">Sources:</p>
            <div className="flex flex-wrap gap-1">
              {message.citations.map((c) => (
                <CitationBadge key={c.id} citation={c} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
