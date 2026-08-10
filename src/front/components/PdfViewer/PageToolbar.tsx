import { useAtom } from "jotai";
import { currentPageAtom, outlineOpenAtom } from "../../atoms/pdfAtom";

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
 * The wide layout keeps its own row of controls below the page, where a mouse
 * reaches them without covering anything. A thumb does not, and a row that has
 * to be scrolled to is a row that is not there — so this one is a sibling of
 * the page rather than part of what scrolls.
 *
 * The page and the outline are read from their atoms rather than passed in,
 * since the keyboard shortcuts write the same two.
 */
export function PageToolbar({
  pageCount,
  highlightCount,
  chatOpen,
  onToggleChat,
}: PageToolbarProps) {
  const [currentPage, setCurrentPage] = useAtom(currentPageAtom);
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

      <button
        type="button"
        aria-label="前のページ"
        disabled={currentPage <= 1}
        onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
        className={`${TAP_TARGET} rounded-lg text-gray-600 disabled:opacity-30`}
      >
        <ChevronIcon direction="left" />
      </button>

      <span className="px-2 text-sm text-gray-600 tabular-nums">
        {currentPage} / {pageCount}
      </span>

      <button
        type="button"
        aria-label="次のページ"
        disabled={currentPage >= pageCount}
        onClick={() => setCurrentPage(Math.min(pageCount, currentPage + 1))}
        className={`${TAP_TARGET} rounded-lg text-gray-600 disabled:opacity-30`}
      >
        <ChevronIcon direction="right" />
      </button>

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

function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="mx-auto h-5 w-5 fill-none stroke-current stroke-[1.7]"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={direction === "left" ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} />
    </svg>
  );
}
