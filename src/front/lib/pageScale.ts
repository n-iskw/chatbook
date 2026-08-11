/**
 * How large a PDF page is drawn: a fit-to-page baseline, times the reader's own
 * zoom.
 *
 * Kept apart from the components so the arithmetic can be tested without pdf.js
 * or a laid-out pane.
 */

/** Zoom is relative to the fit scale, so 1 means "the whole page is visible". */
export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 5;

/**
 * How much of a pinch a wheel delta is worth. macOS reports a pinch as a
 * `ctrlKey` wheel event whose delta is a few units per frame, so a deliberate
 * gesture lands around 100 and doubles the page.
 */
const PINCH_SENSITIVITY = 0.005;

export interface PageSize {
  /** The page's own size, at scale 1. */
  baseWidth: number;
  baseHeight: number;
}

export interface PaneSize {
  width: number;
  height: number;
}

/**
 * The scale at which the whole page is visible in the pane.
 *
 * The height decides it in a pane wider than the page is tall — the state a
 * reader is in with the chat panel folded away — and the width takes over once
 * the pane is too narrow for that.
 */
export function fitPageScale(page: PageSize, pane: PaneSize): number {
  return Math.min(pane.width / page.baseWidth, pane.height / page.baseHeight);
}

/** The zoom a pinch of `deltaY` leaves behind, kept inside the viewer's range. */
export function nextZoom(zoom: number, deltaY: number): number {
  const zoomed = zoom * (1 - deltaY * PINCH_SENSITIVITY);
  // Clamped on the result, not on the delta: one trackpad event can report a
  // delta past 1/PINCH_SENSITIVITY, which turns the factor negative.
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoomed));
}
