import { useState, useRef, useEffect } from "react";

interface SelectionPopoverProps {
  onSubmit: (question: string) => void;
  onDismiss: () => void;
}

/**
 * Question input shown above the selected text. The caller positions it; this
 * component only owns the input, submit and dismiss behaviour.
 */
export function SelectionPopover({ onSubmit, onDismiss }: SelectionPopoverProps) {
  const [question, setQuestion] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Dismiss on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onDismiss();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onDismiss]);

  // Dismiss on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onDismiss();
      }
    };
    // Delay to avoid dismissing on the same mouseup that triggered this
    setTimeout(() => document.addEventListener("mousedown", handleClick), 0);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onDismiss]);

  const handleSubmit = () => {
    const q = question.trim();
    if (q) {
      onSubmit(q);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div
      ref={popoverRef}
      className="relative bg-white rounded-lg shadow-xl border border-gray-200 p-3"
    >
      <div
        className="absolute left-1/2 -translate-x-1/2 w-3 h-3 bg-white border-b border-r border-gray-200 rotate-45"
        style={{ top: "calc(100% - 6px)" }}
      />
      <textarea
        ref={inputRef}
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="選択した文章について質問する..."
        className="w-full min-w-[280px] p-2 text-sm border border-gray-300 rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        rows={2}
      />
      <div className="flex justify-end gap-2 mt-2">
        <button
          type="button"
          onClick={onDismiss}
          className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700 cursor-pointer"
        >
          キャンセル
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!question.trim()}
          className="px-3 py-1 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          質問する
        </button>
      </div>
    </div>
  );
}
