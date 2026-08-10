// oxlint-disable-next-line no-restricted-imports -- document への selectionchange 購読と、window への pointerdown / pointerup 購読 (選択が伸びている最中かを知るため) に必要
import { useEffect, useRef } from "react";

/**
 * How long the selection has to stand still before it counts as settled.
 *
 * Long enough to sit out the run of announcements a drag produces, short enough
 * that letting go feels answered.
 */
export const SELECTION_SETTLE_MS = 250;

/**
 * Tell the caller about a passage once the reader has finished choosing it.
 *
 * The browser announces a new selection the whole way through a drag, and every
 * one of those is a passage still being chosen. What the reader has settled on
 * is the one that stops changing — so this waits out the run, and waits for the
 * pointer to come up as well.
 *
 * Both halves matter, and neither is enough alone. A mouse drag can pause
 * mid-passage for longer than the wait; the pointer being down is what says the
 * reader has not finished. And iOS drags its own selection handles without
 * sending pointer events at all — with nothing ever reported as pressed, this
 * falls back to waiting out the announcements, which is what the phone did
 * before pointers were watched.
 *
 * Watched on `window` rather than on a container: the handles a platform draws
 * are outside the page's elements, so a container would lose sight of the press.
 *
 * This is why the reader can select a passage at any window size. Reading it off
 * `mouseup` instead — as the wide layout used to — works for a mouse and for
 * nothing else: a finger never lets a button go.
 */
export function useSettledSelection(
  onSettled: () => void,
  { enabled = true }: { enabled?: boolean } = {},
): void {
  // Kept in a ref so a caller that rebuilds its handler every render does not
  // re-subscribe, and restart the wait, on every render.
  const onSettledRef = useRef(onSettled);
  onSettledRef.current = onSettled;

  useEffect(() => {
    if (!enabled) return;

    let settle = 0;
    let pressed = false;

    const readWhenStill = () => {
      clearTimeout(settle);
      settle = window.setTimeout(() => {
        // Still pressed: the passage is still growing, however still the
        // selection has been. Ask again rather than measuring half of it.
        if (pressed) {
          readWhenStill();
          return;
        }
        onSettledRef.current();
      }, SELECTION_SETTLE_MS);
    };

    const press = () => {
      pressed = true;
    };
    const release = () => {
      pressed = false;
    };

    document.addEventListener("selectionchange", readWhenStill);
    window.addEventListener("pointerdown", press, true);
    window.addEventListener("pointerup", release, true);
    window.addEventListener("pointercancel", release, true);

    return () => {
      clearTimeout(settle);
      document.removeEventListener("selectionchange", readWhenStill);
      window.removeEventListener("pointerdown", press, true);
      window.removeEventListener("pointerup", release, true);
      window.removeEventListener("pointercancel", release, true);
    };
  }, [enabled]);
}
