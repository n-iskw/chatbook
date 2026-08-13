/** A passage the reader dragged over in the conversation, ready to be quoted. */
export interface ChatQuoteSelection {
  text: string;
  /** Where the passage sits in the viewport, so the action can be put beside it. */
  rect: { top: number; left: number; width: number };
}

/** Reads whatever is selected inside the given root. */
export type ReadChatQuote = (root: Element) => ChatQuoteSelection | null;

/**
 * The passage selected inside `root`, or nothing when there is none to quote.
 *
 * Scoped to the root the caller hands over — the thread — so that a drag over
 * the page, or over the quote box under the input, does not offer to quote
 * itself. The pdf side cannot be reused here: it reads the indices pdf.js
 * writes onto its text layer, which chat bubbles have nothing of.
 */
export function readChatQuote(
  selection: Selection | null,
  root: Element,
): ChatQuoteSelection | null {
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;

  const range = selection.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return null;

  const text = selection.toString().trim();
  if (!text) return null;

  const box = range.getBoundingClientRect();
  return { text, rect: { top: box.top, left: box.left, width: box.width } };
}

/** The live selection, as the browser has it. */
export const readChatQuoteFromWindow: ReadChatQuote = (root) =>
  readChatQuote(window.getSelection(), root);
