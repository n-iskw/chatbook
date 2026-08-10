/**
 * Where the reader stops laying its panes out side by side.
 *
 * The same number as Tailwind's `md`, so a rule written as `md:flex-row` and a
 * branch taken in JavaScript always agree about which layout is on screen.
 */
export const NARROW_MAX_WIDTH = 767;

export const NARROW_QUERY = `(max-width: ${NARROW_MAX_WIDTH}px)`;
