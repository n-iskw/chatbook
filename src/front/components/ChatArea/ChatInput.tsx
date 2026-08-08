import { useState } from "react";
import { isSubmitKey } from "../../lib/isSubmitKey";

interface ChatInputProps {
  onSend: (content: string) => void;
  disabled?: boolean;
}

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [input, setInput] = useState("");

  const handleSend = () => {
    const trimmed = input.trim();
    if (trimmed && !disabled) {
      onSend(trimmed);
      setInput("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (isSubmitKey(e.nativeEvent as unknown as KeyboardEvent)) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="p-3 border-t border-gray-200 bg-white shrink-0">
      <div className="flex gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="質問を入力..."
          disabled={disabled}
          rows={2}
          className="flex-1 p-2 text-sm border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={disabled || !input.trim()}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shrink-0 transition-colors"
        >
          送信
        </button>
      </div>
    </div>
  );
}
