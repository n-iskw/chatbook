export interface SelectionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Sub-pixel slack, so rects that differ only by rounding count as the same. */
const TOLERANCE = 1;

function covers(outer: SelectionRect, inner: SelectionRect): boolean {
  return (
    outer.x <= inner.x + TOLERANCE &&
    outer.y <= inner.y + TOLERANCE &&
    outer.x + outer.width >= inner.x + inner.width - TOLERANCE &&
    outer.y + outer.height >= inner.y + inner.height - TOLERANCE
  );
}

/**
 * The rects worth drawing for a selection, one per line.
 *
 * `Range.getClientRects()` also returns zero-width caret rects and, for nodes
 * fully inside the range, near-duplicates of a line that differ by a fraction
 * of a pixel. Drawing those stacks translucent boxes on one another and stores
 * the redundancy with the highlight.
 */
export function tidySelectionRects(rects: SelectionRect[]): SelectionRect[] {
  const kept: SelectionRect[] = [];

  for (const rect of rects) {
    if (rect.width <= 0 || rect.height <= 0) continue;
    if (kept.some((existing) => covers(existing, rect))) continue;
    kept.push(rect);
  }

  return kept;
}
