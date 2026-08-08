export type KeybindingMode = "none" | "vim" | "emacs";

export type ViewerAction = "nextPage" | "prevPage" | "firstPage" | "lastPage" | "toggleOutline";

/** The parts of a KeyboardEvent the resolver needs, so it stays DOM-free. */
export interface KeyStroke {
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}

export interface ResolveResult {
  action: ViewerAction | null;
  /** Prefix carried into the next stroke, e.g. "g" or "C-c". */
  pending: string | null;
}

const NOTHING: ResolveResult = { action: null, pending: null };

function isPlain(stroke: KeyStroke): boolean {
  return !stroke.ctrlKey && !stroke.altKey && !stroke.metaKey;
}

function isCtrl(stroke: KeyStroke, key: string): boolean {
  return stroke.ctrlKey && !stroke.altKey && !stroke.metaKey && stroke.key.toLowerCase() === key;
}

function isAlt(stroke: KeyStroke, key: string): boolean {
  return stroke.altKey && !stroke.ctrlKey && !stroke.metaKey && stroke.key === key;
}

function resolveVim(stroke: KeyStroke, pending: string | null): ResolveResult {
  if (pending === "g") {
    if (isPlain(stroke) && stroke.key === "g") return { action: "firstPage", pending: null };
    // Fall through so the stroke still gets its own chance to match
  }

  if (!isPlain(stroke)) return NOTHING;

  switch (stroke.key) {
    case "j":
      return { action: "nextPage", pending: null };
    case "k":
      return { action: "prevPage", pending: null };
    case "t":
      return { action: "toggleOutline", pending: null };
    case "G":
      return { action: "lastPage", pending: null };
    case "g":
      return { action: null, pending: "g" };
    default:
      return NOTHING;
  }
}

function resolveEmacs(stroke: KeyStroke, pending: string | null): ResolveResult {
  if (pending === "C-c") {
    if (isPlain(stroke) && stroke.key === "t") {
      return { action: "toggleOutline", pending: null };
    }
    // Fall through so the stroke still gets its own chance to match
  }

  if (isCtrl(stroke, "n")) return { action: "nextPage", pending: null };
  if (isCtrl(stroke, "p")) return { action: "prevPage", pending: null };
  if (isCtrl(stroke, "c")) return { action: null, pending: "C-c" };
  if (isAlt(stroke, "<")) return { action: "firstPage", pending: null };
  if (isAlt(stroke, ">")) return { action: "lastPage", pending: null };

  return NOTHING;
}

/**
 * Map a key stroke to a viewer action for the active mode.
 *
 * Two-stroke bindings (vim `gg`, emacs `C-c t`) are handled by carrying a
 * `pending` prefix between calls. The prefix is dropped as soon as a stroke
 * does not complete it — there is no timer, so the behaviour is deterministic.
 */
export function resolveAction(
  mode: KeybindingMode,
  stroke: KeyStroke,
  pending: string | null,
): ResolveResult {
  switch (mode) {
    case "vim":
      return resolveVim(stroke, pending);
    case "emacs":
      return resolveEmacs(stroke, pending);
    case "none":
      return NOTHING;
  }
}

/** Key list shown in the settings menu so the bindings are discoverable. */
export const KEYBINDING_HELP: Record<Exclude<KeybindingMode, "none">, [string, string][]> = {
  vim: [
    ["j", "次のページ"],
    ["k", "前のページ"],
    ["t", "目次の開閉"],
    ["gg", "最初のページ"],
    ["G", "最後のページ"],
  ],
  emacs: [
    ["C-n", "次のページ"],
    ["C-p", "前のページ"],
    ["C-c t", "目次の開閉"],
    ["M-<", "最初のページ"],
    ["M->", "最後のページ"],
  ],
};
