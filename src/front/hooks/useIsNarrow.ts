import { useSyncExternalStore } from "react";
import { NARROW_QUERY } from "../lib/viewport";

/**
 * The viewport is the outside world, so it is subscribed to rather than read
 * into state: `useSyncExternalStore` keeps every component that asks on the
 * same answer within a commit, which a width copied into each one's state
 * would not.
 *
 * What is subscribed to is the media query's boolean, not the width itself.
 * A width would re-render the reader on every pixel of a drag; this only moves
 * when the layout does.
 */
function subscribe(onStoreChange: () => void): () => void {
  const query = window.matchMedia(NARROW_QUERY);
  query.addEventListener("change", onStoreChange);
  return () => query.removeEventListener("change", onStoreChange);
}

function getSnapshot(): boolean {
  return window.matchMedia(NARROW_QUERY).matches;
}

/** Whether the reader is on a screen too narrow to put its panes side by side. */
export function useIsNarrow(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot);
}
