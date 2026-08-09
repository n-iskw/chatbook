import { atomWithStorage, createJSONStorage } from "jotai/utils";
import { z } from "zod";
import type { KeybindingMode } from "../lib/keybindings";
import { MAX_ZOOM, MIN_ZOOM } from "../lib/pageScale";

const keybindingModeSchema = z.enum(["none", "vim", "emacs"]);

/**
 * localStorage as a source of settings, with anything the schema rejects
 * treated as absent.
 *
 * The stored value is outside this app's control — an older release, another
 * tab, or the devtools can leave something else there. For the keybinding mode
 * the damage is concrete: `resolveAction` has no default branch, so an unknown
 * mode makes it return undefined and the shortcut hook throws while
 * destructuring it, on the first key pressed.
 *
 * **Both ways in have to be checked.** A value read at startup arrives through
 * `getItem`, but a value another tab writes arrives through `subscribe`, which
 * parses the new string itself and never consults `getItem`. Checking only the
 * former leaves the session open to exactly the value it refused to start with.
 *
 * Written out rather than built with jotai's `unstable_withStorageValidator`,
 * which is both marked unstable and has that same gap: it replaces `getItem`
 * alone.
 */
function validatedStorage<T>(schema: z.ZodType<T>) {
  const jsonStorage = createJSONStorage<T>(() => localStorage);
  const accept = (value: unknown, fallback: T): T => {
    const parsed = schema.safeParse(value);
    return parsed.success ? parsed.data : fallback;
  };

  /** Present whenever the environment can report another tab's writes. */
  const subscribeToStorage = jsonStorage.subscribe;

  return {
    ...jsonStorage,
    getItem: (key: string, initialValue: T): T =>
      accept(jsonStorage.getItem(key, initialValue), initialValue),
    subscribe: subscribeToStorage
      ? (key: string, callback: (value: T) => void, initialValue: T) =>
          subscribeToStorage(key, (value) => callback(accept(value, initialValue)), initialValue)
      : undefined,
  };
}

/** Persisted so the reader keeps the chosen bindings across sessions. */
export const keybindingModeAtom = atomWithStorage<KeybindingMode>(
  "chatbook:keybindings",
  "vim",
  validatedStorage(keybindingModeSchema),
  { getOnInit: true },
);

/**
 * Whether the assistant may search the web, on by default: it should fall back
 * to the web when the document alone cannot answer the question.
 *
 * Persisted rather than held in the store because the reader builds a fresh
 * jotai store per book. A setting kept only in the store would go back to its
 * default on every book change and on every trip through the shelf, which is
 * not what a setting sat next to the keybindings in the same menu should do.
 */
export const useWebSearchAtom = atomWithStorage<boolean>(
  "chatbook:web-search",
  true,
  validatedStorage(z.boolean()),
  { getOnInit: true },
);

function createZoomAtom(pdfId: string) {
  return atomWithStorage<number>(
    `chatbook:zoom:${pdfId}`,
    1,
    validatedStorage(z.number().min(MIN_ZOOM).max(MAX_ZOOM)),
    { getOnInit: true },
  );
}

const zoomAtoms = new Map<string, ReturnType<typeof createZoomAtom>>();

/**
 * How far a book is zoomed in, relative to the scale its pages fit the pane at,
 * so 1 is the whole page and the zoom survives a resize of the pane.
 *
 * One atom per book: a reference book read at 200% and a novel read whole are
 * different habits, and the reader's store is thrown away between books anyway,
 * so the book's id goes in the storage key. They are kept here rather than
 * built per render because an atom is identified by the object itself — a new
 * one each render is a new, empty piece of state.
 *
 * Written out instead of jotai's `atomFamily`, which is deprecated and warns on
 * every book opened.
 */
export function zoomAtomFor(pdfId: string) {
  const existing = zoomAtoms.get(pdfId);
  if (existing) return existing;

  const created = createZoomAtom(pdfId);
  zoomAtoms.set(pdfId, created);
  return created;
}
