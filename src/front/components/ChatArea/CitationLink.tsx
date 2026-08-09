import { useSetAtom } from "jotai";
import type { Citation } from "../../../shared/schemas/citation";
import { citedPassageAtom, currentPageAtom } from "../../atoms/pdfAtom";

interface CitationLinkProps {
  citation: Citation;
}

/**
 * Why a source has no page to jump to. A marker that simply cannot be clicked
 * looks like a bug; "not in the book" in particular is the reader's only hint
 * that the model may not have quoted the passage as it is written.
 */
const PAGE_MISS_TITLE: Record<NonNullable<Citation["pageMiss"]>, string> = {
  "not-in-book":
    "本文に一致する箇所が見つかりませんでした（引用が本文どおりでない可能性があります）",
  "no-quote": "出典に引用文が入っていません",
  "single-page-book": "この本は1ページなので移動先がありません",
};

/**
 * A `[n]` in the answer's body, as the way to the source it names.
 *
 * It sits in the sentence it belongs to rather than in a list underneath, so
 * the reader can follow a claim without first working out which of the sources
 * it came from.
 */
export function CitationLink({ citation }: CitationLinkProps) {
  const setCurrentPage = useSetAtom(currentPageAtom);
  const setCitedPassage = useSetAtom(citedPassageAtom);

  const label = `[${citation.id}]`;

  if (citation.type === "web" && citation.url) {
    return (
      <a
        href={citation.url}
        target="_blank"
        rel="noopener noreferrer"
        title={citation.url}
        className="text-green-700 no-underline hover:underline"
      >
        {label}
      </a>
    );
  }

  const pageNumber = citation.pageNumber;
  // Without a page there is nowhere to jump to, so the marker is not a control
  if (!pageNumber) {
    const reason = citation.pageMiss;
    const title = reason ? `${PAGE_MISS_TITLE[reason]}: ${citation.text}` : citation.text;
    return (
      <span title={title} className="text-gray-400">
        {label}
      </span>
    );
  }

  return (
    <button
      type="button"
      aria-label={`出典 [${citation.id}] のページへ移動`}
      // The page and the passage move together: turning to the page alone would
      // leave the reader to find the quoted lines on it themselves, which is
      // what the badges under the answer used to do.
      onClick={() => {
        setCurrentPage(pageNumber);
        setCitedPassage({ pageNumber, text: citation.text });
      }}
      title={citation.text}
      className="cursor-pointer align-baseline text-blue-600 hover:underline"
    >
      {label}
    </button>
  );
}
