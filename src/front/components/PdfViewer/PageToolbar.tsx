import { useAtom } from "jotai";
import { outlineOpenAtom } from "../../atoms/pdfAtom";
import { PageStepper } from "./PageStepper";

/** Apple and Android both put the floor for a tappable control here. */
const TAP_TARGET = "h-11 min-w-11";

interface PageToolbarProps {
  pageCount: number;
  /** How many highlights the book has, shown on the chat button. */
  highlightCount: number;
  chatOpen: boolean;
  onToggleChat: () => void;
}

/**
 * The reader's controls on a screen with room for one column, held at the
 * bottom of the window rather than under the page.
 *
 * The wide layout folds its panels from the header, and puts the page controls
 * below the page for the finger that is wide and touches (a tablet). A thumb
 * reaches neither, and a row that has to be scrolled to is a row that is not
 * there — so this one is a sibling of the page rather than part of what
 * scrolls, and it carries the two panel buttons as well.
 *
 * The outline is read from its atom rather than passed in, since the keyboard
 * shortcuts write the same one.
 */
export function PageToolbar({
  pageCount,
  highlightCount,
  chatOpen,
  onToggleChat,
}: PageToolbarProps) {
  const [outlineOpen, setOutlineOpen] = useAtom(outlineOpenAtom);

  return (
    <nav
      aria-label="ページ操作"
      className="flex shrink-0 items-center justify-between border-t border-gray-200 bg-white px-1 pb-[env(safe-area-inset-bottom)]"
    >
      <button
        type="button"
        aria-label="目次"
        aria-pressed={outlineOpen}
        onClick={() => setOutlineOpen((open) => !open)}
        className={`${TAP_TARGET} rounded-lg px-2 text-xs text-gray-600 aria-pressed:text-blue-600`}
      >
        目次
      </button>

      <PageStepper pageCount={pageCount} />

      <button
        type="button"
        aria-label="チャット"
        aria-pressed={chatOpen}
        onClick={onToggleChat}
        className={`${TAP_TARGET} rounded-lg px-2 text-xs text-gray-600 aria-pressed:text-blue-600`}
      >
        チャット
        {highlightCount > 0 && (
          // The count rides along with the word rather than replacing it, so
          // the button still says what it opens.
          <span
            aria-hidden="true"
            className="ml-1 rounded-full bg-blue-600 px-1.5 text-[10px] text-white tabular-nums"
          >
            {highlightCount}
          </span>
        )}
      </button>
    </nav>
  );
}
