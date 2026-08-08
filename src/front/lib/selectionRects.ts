export interface SelectionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Two rects belong to the same line when their tops are within this share of a line's height. */
const SAME_LINE_RATIO = 0.5;

function onSameLine(a: SelectionRect, b: SelectionRect): boolean {
  return Math.abs(a.y - b.y) < Math.min(a.height, b.height) * SAME_LINE_RATIO;
}

function span(a: SelectionRect, b: SelectionRect): SelectionRect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
}

/**
 * One rect per line of a selection.
 *
 * `Range.getClientRects()` describes the selection piece by piece: pdf.js gives
 * each phrase of a page its own span, so a single line comes back as several
 * rects with the spaces between phrases missing, alongside zero-width caret
 * rects and near-duplicates that differ by a fraction of a pixel. Drawing those
 * as they are leaves the highlight full of holes, and stores the holes with it.
 */
export function tidySelectionRects(rects: SelectionRect[]): SelectionRect[] {
  const lines: SelectionRect[] = [];

  for (const rect of rects) {
    if (rect.width <= 0 || rect.height <= 0) continue;

    const index = lines.findIndex((line) => onSameLine(line, rect));
    if (index < 0) {
      lines.push(rect);
    } else {
      lines[index] = span(lines[index], rect);
    }
  }

  return lines;
}

/** A selection ready to be drawn over the page it was made on. */
export interface PageSelection {
  rects: SelectionRect[];
  /** Page width at the time of measuring, so the rects can be rescaled later. */
  pageWidth: number;
}

/**
 * The lines a range covers, measured against the page element rather than the
 * viewport, so they survive scrolling and can be stored with the highlight.
 *
 * DOM-bound, so its behaviour is covered by the end-to-end tests; the pure part
 * is `tidySelectionRects`.
 */
export function selectionOnPage(range: Range, pageElement: Element): PageSelection {
  const page = pageElement.getBoundingClientRect();

  return {
    rects: tidySelectionRects(
      Array.from(range.getClientRects()).map((line) => ({
        x: line.left - page.left,
        y: line.top - page.top,
        width: line.width,
        height: line.height,
      })),
    ),
    pageWidth: page.width,
  };
}
