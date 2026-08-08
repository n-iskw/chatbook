import { atomWithStorage } from "jotai/utils";
import type { KeybindingMode } from "../lib/keybindings";

/** Persisted so the reader keeps the chosen bindings across sessions. */
export const keybindingModeAtom = atomWithStorage<KeybindingMode>(
  "chatbook:keybindings",
  "vim",
  undefined,
  { getOnInit: true },
);
