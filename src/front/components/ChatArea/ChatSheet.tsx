import type { ReactNode } from "react";
import type { ChatSheetState } from "../../atoms/chatAtom";

interface ChatSheetProps {
  state: ChatSheetState;
  onChange: (next: ChatSheetState) => void;
  children: ReactNode;
}

/**
 * The conversation, drawn up over the page on a screen with room for one column.
 *
 * Two things about how it is built are load-bearing, both learned from the
 * prototype this came from:
 *
 * The height is what opens and closes it, rather than sliding a full-height
 * sheet down out of view. Pushed down, the composer goes past the bottom of the
 * window at the halfway stop and the reader can see the answer but not reply to
 * it.
 *
 * It is bounded by the pane it sits in, which stops above the toolbar. Reading
 * on is the reason to have the book and the answer up together, so the sheet
 * never takes the page turn with it — which is also what lets it take the whole
 * of that pane when it is drawn all the way up: a strip of the page left above
 * an answer is neither readable nor worth the lines of the answer it costs.
 */
export function ChatSheet({ state, onChange, children }: ChatSheetProps) {
  if (state === "closed") return null;

  const expanded = state === "full";

  return (
    <section
      aria-label="チャット"
      className={`absolute inset-x-0 bottom-0 z-30 flex flex-col rounded-t-2xl border-t border-gray-200 bg-white shadow-[0_-6px_24px_rgba(19,26,41,0.18)] ${
        expanded ? "h-full" : "h-[46%]"
      }`}
    >
      <div className="relative flex h-11 shrink-0 items-center justify-center">
        <button
          type="button"
          aria-label={expanded ? "チャットを縮める" : "チャットを広げる"}
          onClick={() => onChange(expanded ? "half" : "full")}
          className="flex h-11 w-20 items-center justify-center"
        >
          <span aria-hidden="true" className="block h-1 w-10 rounded-full bg-gray-300" />
        </button>
        <button
          type="button"
          aria-label="チャットを閉じる"
          onClick={() => onChange("closed")}
          className="absolute right-1 flex h-11 w-11 items-center justify-center rounded-lg text-gray-500"
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
      </div>

      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}
