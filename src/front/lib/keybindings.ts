export type KeybindingMode = "none" | "vim" | "emacs";

export type ViewerAction =
  | "nextPage"
  | "prevPage"
  | "firstPage"
  | "lastPage"
  | "scrollDown"
  | "scrollUp"
  | "toggleOutline";

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

/**
 * The arrow keys, which belong to every mode — including "none".
 *
 * They are what a reader who has chosen no bindings still reaches for, so they
 * are resolved before the mode is consulted. `shiftKey` counts as a modifier
 * here: shift with an arrow extends a text selection, and taking that would
 * cost the reader the very thing the popover asks them to pick.
 */
function resolveArrows(stroke: KeyStroke): ViewerAction | null {
  if (!isPlain(stroke) || stroke.shiftKey) return null;

  switch (stroke.key) {
    case "ArrowRight":
      return "nextPage";
    case "ArrowLeft":
      return "prevPage";
    case "ArrowDown":
      return "scrollDown";
    case "ArrowUp":
      return "scrollUp";
    default:
      return null;
  }
}

function resolveVim(stroke: KeyStroke, pending: string | null): ResolveResult {
  if (pending === "g") {
    if (isPlain(stroke) && stroke.key === "g") return { action: "firstPage", pending: null };
    // Fall through so the stroke still gets its own chance to match
  }

  if (!isPlain(stroke)) return NOTHING;

  switch (stroke.key) {
    case "l":
      return { action: "nextPage", pending: null };
    case "h":
      return { action: "prevPage", pending: null };
    case "j":
      return { action: "scrollDown", pending: null };
    case "k":
      return { action: "scrollUp", pending: null };
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

  // As in emacs itself, where C-f / C-b move by character and C-n / C-p by
  // line: the page is what the character is here, and scrolling what the line
  // is.
  if (isCtrl(stroke, "f")) return { action: "nextPage", pending: null };
  if (isCtrl(stroke, "b")) return { action: "prevPage", pending: null };
  if (isCtrl(stroke, "n")) return { action: "scrollDown", pending: null };
  if (isCtrl(stroke, "p")) return { action: "scrollUp", pending: null };
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
 *
 * The arrows are answered first, whatever the mode, and an arrow drops any
 * pending prefix along with it: it did not complete the sequence.
 */
export function resolveAction(
  mode: KeybindingMode,
  stroke: KeyStroke,
  pending: string | null,
): ResolveResult {
  const arrow = resolveArrows(stroke);
  if (arrow) return { action: arrow, pending: null };

  switch (mode) {
    case "vim":
      return resolveVim(stroke, pending);
    case "emacs":
      return resolveEmacs(stroke, pending);
    case "none":
      return NOTHING;
  }
}

/**
 * The arrow keys, listed apart from the modes because they answer in all of
 * them. Kept out of `KEYBINDING_HELP` so the same two rows are not written
 * three times over.
 */
export const ARROW_KEYBINDING_HELP: [string, string][] = [
  ["←/→", "前 / 次のページ"],
  ["↑/↓", "スクロール"],
];

/** Key list shown in the settings menu so the bindings are discoverable. */
export const KEYBINDING_HELP: Record<Exclude<KeybindingMode, "none">, [string, string][]> = {
  vim: [
    ["l", "次のページ"],
    ["h", "前のページ"],
    ["j", "下にスクロール"],
    ["k", "上にスクロール"],
    ["t", "目次の開閉"],
    ["gg", "最初のページ"],
    ["G", "最後のページ"],
  ],
  emacs: [
    ["C-f", "次のページ"],
    ["C-b", "前のページ"],
    ["C-n", "下にスクロール"],
    ["C-p", "上にスクロール"],
    ["C-c t", "目次の開閉"],
    ["M-<", "最初のページ"],
    ["M->", "最後のページ"],
  ],
};
