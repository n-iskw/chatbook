/**
 * A controllable `matchMedia` for jsdom, which has no layout and so reports no
 * width of its own.
 *
 * The default is a desktop width: every test written before the reader had a
 * narrow layout expects the three-pane one, and would otherwise have to say so.
 * A test that wants the narrow layout asks for it with `setViewportWidth`.
 */

/** Wide enough for the desktop layout, and for `lg:` in the shelf's grid. */
const DEFAULT_WIDTH = 1280;

let currentWidth = DEFAULT_WIDTH;

type Listener = (event: MediaQueryListEvent) => void;

/** Live lists, so a width change can tell the ones whose answer moved. */
const lists = new Set<StubMediaQueryList>();

/**
 * Only the width features the app asks about.
 *
 * Anything else answers false rather than throwing: a query this does not
 * understand should leave a component on its default branch, not break the run.
 */
function evaluate(query: string, width: number): boolean {
  const max = /\(\s*max-width:\s*(\d+)px\s*\)/.exec(query);
  if (max) return width <= Number(max[1]);

  const min = /\(\s*min-width:\s*(\d+)px\s*\)/.exec(query);
  if (min) return width >= Number(min[1]);

  return false;
}

/**
 * Not declared as implementing `MediaQueryList`: its `addEventListener` is an
 * overload set covering every event a media query can raise, and matching that
 * would say more about the stub than the reader ever asks of it.
 */
class StubMediaQueryList {
  readonly media: string;
  matches: boolean;
  private readonly listeners = new Set<Listener>();

  constructor(query: string) {
    this.media = query;
    this.matches = evaluate(query, currentWidth);
  }

  addEventListener(_type: "change", listener: Listener): void {
    this.listeners.add(listener);
  }

  removeEventListener(_type: "change", listener: Listener): void {
    this.listeners.delete(listener);
  }

  /** Re-answer for the new width, and speak up only if the answer changed. */
  refresh(): void {
    const next = evaluate(this.media, currentWidth);
    if (next === this.matches) return;

    this.matches = next;
    const event = { matches: next, media: this.media } as MediaQueryListEvent;
    for (const listener of this.listeners) listener(event);
  }
}

/** Put the stub in place. Called once from the test setup file. */
export function installViewportStub(): void {
  window.matchMedia = ((query: string) => {
    const list = new StubMediaQueryList(query);
    lists.add(list);
    return list as unknown as MediaQueryList;
  }) as typeof window.matchMedia;
}

/**
 * Report a different width to everything already asking.
 *
 * Listeners fire synchronously, so a change made while a component is mounted
 * belongs inside `act`.
 */
export function setViewportWidth(width: number): void {
  currentWidth = width;
  for (const list of lists) list.refresh();
}

/** A width no phone has, for the tests that want the narrow layout. */
export const PHONE_WIDTH = 390;

/** Back to a desktop width, and forget the lists the finished test left. */
export function resetViewport(): void {
  currentWidth = DEFAULT_WIDTH;
  lists.clear();
}
