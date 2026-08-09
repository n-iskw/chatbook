import { useSetAtom } from "jotai";
import type { Citation } from "../../../shared/schemas/citation";
import { currentPageAtom } from "../../atoms/pdfAtom";

interface CitationBadgeProps {
  citation: Citation;
}

const BADGE_CLASS = "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium";

/**
 * Why a source has no page to jump to. A badge that simply cannot be clicked
 * looks like a bug; "not in the book" in particular is the reader's only hint
 * that the model may not have quoted the passage as it is written.
 */
const PAGE_MISS_TITLE: Record<NonNullable<Citation["pageMiss"]>, string> = {
  "not-in-book":
    "本文に一致する箇所が見つかりませんでした（引用が本文どおりでない可能性があります）",
  "no-quote": "出典に引用文が入っていません",
  "single-page-book": "この本は1ページなので移動先がありません",
};

export function CitationBadge({ citation }: CitationBadgeProps) {
  const setCurrentPage = useSetAtom(currentPageAtom);

  if (citation.type === "web" && citation.url) {
    return (
      <a
        href={citation.url}
        target="_blank"
        rel="noopener noreferrer"
        title={citation.url}
        className={`${BADGE_CLASS} bg-green-100 text-green-700 transition-colors hover:bg-green-200`}
      >
        [{citation.id}] 🔗
      </a>
    );
  }

  const pageNumber = citation.pageNumber;
  // Without a page there is nowhere to jump to, so the badge is not a control
  if (!pageNumber) {
    const reason = citation.pageMiss;
    const title = reason ? `${PAGE_MISS_TITLE[reason]}: ${citation.text}` : citation.text;
    return (
      <span title={title} className={`${BADGE_CLASS} bg-gray-100 text-gray-500`}>
        [{citation.id}]
      </span>
    );
  }

  return (
    <button
      type="button"
      aria-label={`出典 [${citation.id}] のページへ移動`}
      onClick={() => setCurrentPage(pageNumber)}
      title={citation.text}
      className={`${BADGE_CLASS} cursor-pointer bg-yellow-100 text-yellow-700 transition-colors hover:bg-yellow-200`}
    >
      [{citation.id}] p.{citation.pageNumber}
    </button>
  );
}
