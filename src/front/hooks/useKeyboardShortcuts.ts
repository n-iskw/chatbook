// oxlint-disable-next-line no-restricted-imports -- window への keydown 購読に必要
import { useEffect, useRef } from "react";
import { useAtomValue } from "jotai";
import { keybindingModeAtom } from "../atoms/settingsAtom";
import { resolveAction, type ViewerAction } from "../lib/keybindings";

/**
 * Typing must never trigger shortcuts: without this, "j" could not be typed
 * into the chat box or the question popover.
 */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

/**
 * Bind the reader's keyboard shortcuts for the mode chosen in settings.
 *
 * Subscribed in every mode, "none" included: the arrows answer whatever the
 * reader has chosen. Nothing else is claimed there, since `resolveAction` has
 * only the arrows to give back.
 */
export function useKeyboardShortcuts(onAction: (action: ViewerAction) => void) {
  const mode = useAtomValue(keybindingModeAtom);
  const pendingRef = useRef<string | null>(null);

  // Keep the latest handler without re-subscribing on every render
  const onActionRef = useRef(onAction);
  onActionRef.current = onAction;

  useEffect(() => {
    pendingRef.current = null;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;

      const { action, pending } = resolveAction(mode, event, pendingRef.current);
      pendingRef.current = pending;

      // Only claim the keys we actually use, so browser shortcuts keep working
      if (action || pending) {
        event.preventDefault();
      }
      if (action) {
        onActionRef.current(action);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mode]);
}
