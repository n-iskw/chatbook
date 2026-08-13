interface SelectionActionBarProps {
  /** The passage the reader has settled on, shown back to them. */
  quote: string;
  onAsk: () => void;
  onDismiss: () => void;
}

/**
 * What a passage held down on a touch screen offers, along the bottom of the
 * page rather than floating over it.
 *
 * The wide layout puts the question box straight onto the passage, where a
 * mouse left it. A finger cannot: the box would land under the reader's own
 * hand, next to the platform's own selection menu, and take the keyboard with
 * it before anyone has said they want to type. So the offer comes first, in one
 * fixed place, and the box only follows if it is taken.
 *
 * The passage is quoted back because a phone's selection is easy to get wrong
 * by a word, and this is where that shows before a highlight is stored.
 */
export function SelectionActionBar({ quote, onAsk, onDismiss }: SelectionActionBarProps) {
  return (
    <div className="absolute inset-x-0 bottom-0 z-40 flex items-center gap-2 bg-gray-900 px-3 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] shadow-[0_-6px_24px_rgba(19,26,41,0.3)]">
      <p className="min-w-0 flex-1 truncate text-sm text-gray-200">{`“${quote}”`}</p>
      <button
        type="button"
        aria-label="選択をやめる"
        onClick={onDismiss}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-400"
      >
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="h-5 w-5 fill-none stroke-current stroke-[1.7]"
          strokeLinecap="round"
        >
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
      <button
        type="button"
        onClick={onAsk}
        className="h-11 shrink-0 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white"
      >
        AIに質問
      </button>
    </div>
  );
}
