import type { CitedPassage } from "../atoms/pdfAtom";
import { selectionOnPage, type PageSelection } from "./selectionRects";

/**
 * Where a quoted passage sits among a page's text items. Offsets are into the
 * item's own text, the end one exclusive, so a `Range` can be built from them.
 */
export interface QuoteLocation {
  startSpan: number;
  startOffset: number;
  endSpan: number;
  endOffset: number;
}

/**
 * Whitespace is where the quote and the drawn page diverge: pdf.js cuts a line
 * into an item per phrase, while the model quotes the passage as it reads.
 */
function normalize(text: string): string {
  return text.replace(/\s+/g, "");
}

/**
 * Fragment size and stride, kept the same as `chatService.findPageNumber`: the
 * page was found by these, so the passage on it has to be looked for by these.
 */
const FRAGMENT_LENGTH = 24;
const FRAGMENT_STEP = 12;

/**
 * The passage around a fragment that matched, found by walking both ways while
 * the page and the quote keep agreeing.
 *
 * A fragment is only where the search lands. What the reader asked to see is
 * the passage, and the two part company for reasons the fragment cannot tell
 * apart — a source entry that carries a section name and a second quote, a page
 * the passage runs off the end of, a clause the model reworded. Marking the
 * fragment alone would show a windowful of characters starting mid-word.
 */
function extend(
  pageText: string,
  needle: string,
  from: number,
  at: number,
): { start: number; end: number } {
  let start = at;
  let head = from;
  while (head > 0 && start > 0 && needle[head - 1] === pageText[start - 1]) {
    head--;
    start--;
  }

  let end = at + FRAGMENT_LENGTH;
  let tail = from + FRAGMENT_LENGTH;
  // Runs out at the end of the quote; past the end of the page the characters
  // compare unequal, since one side is no longer a character at all
  while (tail < needle.length && needle[tail] === pageText[end]) {
    tail++;
    end++;
  }

  return { start, end };
}

/** Where the needle, or failing that the passage around a fragment of it, sits. */
function matchRange(pageText: string, needle: string): { start: number; end: number } | null {
  const whole = pageText.indexOf(needle);
  if (whole >= 0) return { start: whole, end: whole + needle.length };

  // Scanned from the start of the quote, so a passage the model reworded
  // half-way through is still marked from where it begins
  for (let from = 0; from + FRAGMENT_LENGTH <= needle.length; from += FRAGMENT_STEP) {
    const at = pageText.indexOf(needle.slice(from, from + FRAGMENT_LENGTH));
    if (at >= 0) return extend(pageText, needle, from, at);
  }

  return null;
}

/**
 * The text items a quoted passage covers, or null when the page does not hold
 * it — a quote the model wrote in its own words, or a page the reader was sent
 * to by the position of the passage rather than by its text.
 */
export function locateQuoteInSpans(spanTexts: string[], quote: string): QuoteLocation | null {
  const needle = normalize(quote);
  if (!needle) return null;

  // Every character of the page that survives normalising, with the item and
  // offset it came from, so a match can be carried back to the DOM
  const origins: { span: number; offset: number }[] = [];
  let pageText = "";

  spanTexts.forEach((text, span) => {
    for (let offset = 0; offset < text.length; offset++) {
      if (/\s/.test(text[offset])) continue;
      origins.push({ span, offset });
      pageText += text[offset];
    }
  });

  const at = matchRange(pageText, needle);
  if (!at) return null;

  const start = origins[at.start];
  const end = origins[at.end - 1];
  return {
    startSpan: start.span,
    startOffset: start.offset,
    endSpan: end.span,
    endOffset: end.offset + 1,
  };
}

/**
 * The lines a citation's quote covers on the drawn page, ready to be marked,
 * or null when the page cannot show it.
 *
 * DOM-bound, so its behaviour is covered end to end; the pure part is
 * `locateQuoteInSpans`.
 */
export function citedPassageOnPage(
  pageElement: Element,
  passage: CitedPassage,
): PageSelection | null {
  const spans = Array.from(pageElement.querySelectorAll<HTMLElement>("span[data-text-item-index]"));
  if (spans.length === 0) return null;

  // The page turn and the text layer for it do not land together, so the items
  // on screen can still be the page the reader is leaving
  if (spans[0].dataset.pageNumber !== String(passage.pageNumber)) return null;

  const location = locateQuoteInSpans(
    spans.map((span) => span.textContent ?? ""),
    passage.text,
  );
  if (!location) return null;

  const first = spans[location.startSpan].firstChild;
  const last = spans[location.endSpan].firstChild;
  if (!first || !last) return null;

  const range = document.createRange();
  range.setStart(first, location.startOffset);
  range.setEnd(last, location.endOffset);

  return selectionOnPage(range, pageElement);
}
