import { useAtom } from "jotai";
import { currentPageAtom } from "../../atoms/pdfAtom";

/** Apple and Android both put the floor for a tappable control here. */
const TAP_TARGET = "h-11 min-w-11";

interface PageStepperProps {
  pageCount: number;
}

/**
 * A step back, where the reader is, and a step on.
 *
 * The same three controls wherever they are shown, sized for the thumb that
 * wants them. Two places show them, and they are chosen on different grounds:
 * the one column always holds them at the bottom of the window (`PageToolbar`,
 * on width alone), while the two panes only keep them under the page where the
 * device cannot hover (`PdfViewer`) — a pointer there turns pages at the edges
 * of the page and with h / l.
 *
 * The page is read from its atom rather than passed in, since the keyboard
 * shortcuts and the edges of the page write the same one.
 */
export function PageStepper({ pageCount }: PageStepperProps) {
  const [currentPage, setCurrentPage] = useAtom(currentPageAtom);

  return (
    <>
      <button
        type="button"
        aria-label="前のページ"
        disabled={currentPage <= 1}
        onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
        className={`${TAP_TARGET} cursor-pointer rounded-lg text-gray-600 disabled:cursor-default disabled:opacity-30`}
      >
        <ChevronIcon direction="left" />
      </button>

      {/* No padding of its own: the 44px each button reserves around its
          chevron is already the room between them, and adding to it pulls the
          three apart into three things instead of one control. */}
      <span className="text-sm text-gray-600 tabular-nums">
        {currentPage} / {pageCount}
      </span>

      <button
        type="button"
        aria-label="次のページ"
        disabled={currentPage >= pageCount}
        onClick={() => setCurrentPage(Math.min(pageCount, currentPage + 1))}
        className={`${TAP_TARGET} cursor-pointer rounded-lg text-gray-600 disabled:cursor-default disabled:opacity-30`}
      >
        <ChevronIcon direction="right" />
      </button>
    </>
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
