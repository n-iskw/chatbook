import { describe, it, expect, vi } from "vite-plus/test";
import { render, screen } from "@testing-library/react";
import { Provider, createStore } from "jotai";
import { keybindingModeAtom } from "../atoms/settingsAtom";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts";
import type { KeybindingMode, ViewerAction } from "../lib/keybindings";

function Reader({ onAction }: { onAction: (action: ViewerAction) => void }) {
  useKeyboardShortcuts(onAction);
  return <input aria-label="質問" />;
}

function renderReader(mode: KeybindingMode) {
  const onAction = vi.fn<(action: ViewerAction) => void>();
  const store = createStore();
  store.set(keybindingModeAtom, mode);
  const { unmount } = render(
    <Provider store={store}>
      <Reader onAction={onAction} />
    </Provider>,
  );
  return { onAction, unmount };
}

/** Presses a key and reports whether it was left to the browser. */
function press(target: EventTarget, init: KeyboardEventInit): boolean {
  return target.dispatchEvent(
    new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }),
  );
}

function pressArrowRight(target: EventTarget) {
  press(target, { key: "ArrowRight" });
}

describe("useKeyboardShortcuts", () => {
  it("turns the page on an arrow even when no bindings are chosen", () => {
    const { onAction } = renderReader("none");

    pressArrowRight(window);

    expect(onAction.mock.calls).toStrictEqual([["nextPage"]]);
  });

  it("leaves the arrow to the caret while the reader is typing a question", () => {
    const { onAction } = renderReader("none");
    pressArrowRight(window);

    pressArrowRight(screen.getByRole("textbox", { name: "質問" }));

    expect(onAction.mock.calls).toStrictEqual([["nextPage"]]);
  });

  it("turns the page on vim's l now that every mode stays subscribed", () => {
    const { onAction } = renderReader("vim");

    press(window, { key: "l" });

    expect(onAction.mock.calls).toStrictEqual([["nextPage"]]);
  });

  it("claims a plain arrow from the browser but leaves shift+arrow to extend a selection", () => {
    // Taking the plain arrow is what stops the page scrolling natively as well
    // as by the step the reader asked for; leaving the shifted one is what lets
    // them widen the passage the popover is asking them to pick.
    const { onAction } = renderReader("none");

    expect(press(window, { key: "ArrowRight" })).toBe(false);
    expect(press(window, { key: "ArrowRight", shiftKey: true })).toBe(true);
    expect(onAction.mock.calls).toStrictEqual([["nextPage"]]);
  });

  it("stops answering once the reader has left the book", () => {
    const { onAction, unmount } = renderReader("none");
    pressArrowRight(window);

    unmount();
    pressArrowRight(window);

    expect(onAction.mock.calls).toStrictEqual([["nextPage"]]);
  });
});
