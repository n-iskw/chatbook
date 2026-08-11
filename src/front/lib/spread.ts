/**
 * The two page spread: when a pane has room for one, which pages are up in it,
 * and what turning a page means once two of them are.
 *
 * Kept apart from the viewer so the arithmetic can be tested without a laid out
 * pane or a pdf.js document.
 */

import type { PageSize, PaneSize } from "./pageScale";
import type { PageTurn } from "./touchNavigation";

/**
 * The space between the two pages of a spread, in pixels.
 *
 * Each page carries its own shadow, and without a gap the two run together into
 * one sheet with a seam down it.
 */
export const SPREAD_GAP_PX = 8;

/**
 * Whether the pane has room for two pages beside each other, each at the size
 * one page on its own would be drawn at.
 *
 * Measured against the height fit rather than against whatever the two would be
 * squeezed to: a second page is worth having only if it costs the first one
 * nothing, so a pane that is merely close to wide enough keeps one page up.
 */
export function fitsTwoPages(page: PageSize, pane: PaneSize): boolean {
  // An unmeasured pane makes every page nought pixels wide, which any width at
  // all would then have room for twice over.
  if (pane.width <= 0 || pane.height <= 0) return false;

  const pageWidth = (pane.height / page.baseHeight) * page.baseWidth;
  return pageWidth * 2 + SPREAD_GAP_PX <= pane.width;
}

/**
 * The pages up at once, left to right.
 *
 * The page the reader is on is always the left one, so a link followed to a
 * passage lands on the page that holds it rather than beside it.
 */
export function visiblePages(currentPage: number, pageCount: number, twoUp: boolean): number[] {
  return twoUp && currentPage < pageCount ? [currentPage, currentPage + 1] : [currentPage];
}

/**
 * The page a turn lands on, from the page the reader is on and how many pages
 * are up at once.
 *
 * The one place the arithmetic lives: the edges of the page, a swipe, h / l and
 * the stepper all turn pages, and they have to agree on what a turn is.
 */
export function turnTo(current: number, turn: PageTurn, pageCount: number, step: number): number {
  if (turn === "prev") return Math.max(1, current - step);

  const next = current + step;
  // A turn that would land past the end of the book is the end of it. What is
  // left over is not: from [10|11] of a twelve page book the turn lands on 12,
  // which the reader has not seen and which is shown on its own.
  return next > pageCount ? current : next;
}

/** The page to land on at the end of the book, with `step` pages up at once. */
export function lastSpreadStart(pageCount: number, step: number): number {
  return Math.max(1, pageCount - step + 1);
}
