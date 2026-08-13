import { describe, it, expect } from "vite-plus/test";
import {
  resolveAction,
  type KeyStroke,
  type KeybindingMode,
  type ViewerAction,
} from "./keybindings";

/** Minimal stand-in for the parts of KeyboardEvent the resolver reads. */
function stroke(key: string, modifiers: Partial<KeyStroke> = {}): KeyStroke {
  return { key, ctrlKey: false, altKey: false, metaKey: false, shiftKey: false, ...modifiers };
}

describe("resolveAction in vim mode", () => {
  it("maps l to the next page", () => {
    expect(resolveAction("vim", stroke("l"), null)).toStrictEqual({
      action: "nextPage",
      pending: null,
    });
  });

  it("maps h to the previous page", () => {
    expect(resolveAction("vim", stroke("h"), null)).toStrictEqual({
      action: "prevPage",
      pending: null,
    });
  });

  it("maps j to scrolling down", () => {
    expect(resolveAction("vim", stroke("j"), null)).toStrictEqual({
      action: "scrollDown",
      pending: null,
    });
  });

  it("maps k to scrolling up", () => {
    expect(resolveAction("vim", stroke("k"), null)).toStrictEqual({
      action: "scrollUp",
      pending: null,
    });
  });

  it("maps t to toggling the outline", () => {
    expect(resolveAction("vim", stroke("t"), null)).toStrictEqual({
      action: "toggleOutline",
      pending: null,
    });
  });

  it("maps G to the last page", () => {
    expect(resolveAction("vim", stroke("G", { shiftKey: true }), null)).toStrictEqual({
      action: "lastPage",
      pending: null,
    });
  });

  it("waits for a second g before jumping to the first page", () => {
    const first = resolveAction("vim", stroke("g"), null);
    expect(first).toStrictEqual({ action: null, pending: "g" });

    expect(resolveAction("vim", stroke("g"), first.pending)).toStrictEqual({
      action: "firstPage",
      pending: null,
    });
  });

  it("drops the pending g when an unrelated key follows", () => {
    expect(resolveAction("vim", stroke("x"), "g")).toStrictEqual({ action: null, pending: null });
  });

  it("still resolves a normal binding that follows a dropped prefix", () => {
    expect(resolveAction("vim", stroke("j"), "g")).toStrictEqual({
      action: "scrollDown",
      pending: null,
    });
  });

  it("ignores emacs strokes", () => {
    expect(resolveAction("vim", stroke("n", { ctrlKey: true }), null)).toStrictEqual({
      action: null,
      pending: null,
    });
  });
});

describe("resolveAction in emacs mode", () => {
  it("maps C-n to the next page", () => {
    expect(resolveAction("emacs", stroke("n", { ctrlKey: true }), null)).toStrictEqual({
      action: "nextPage",
      pending: null,
    });
  });

  it("maps C-p to the previous page", () => {
    expect(resolveAction("emacs", stroke("p", { ctrlKey: true }), null)).toStrictEqual({
      action: "prevPage",
      pending: null,
    });
  });

  it("maps M-< to the first page", () => {
    expect(
      resolveAction("emacs", stroke("<", { altKey: true, shiftKey: true }), null),
    ).toStrictEqual({
      action: "firstPage",
      pending: null,
    });
  });

  it("maps M-> to the last page", () => {
    expect(
      resolveAction("emacs", stroke(">", { altKey: true, shiftKey: true }), null),
    ).toStrictEqual({
      action: "lastPage",
      pending: null,
    });
  });

  it("toggles the outline with the C-c t sequence", () => {
    const prefix = resolveAction("emacs", stroke("c", { ctrlKey: true }), null);
    expect(prefix).toStrictEqual({ action: null, pending: "C-c" });

    expect(resolveAction("emacs", stroke("t"), prefix.pending)).toStrictEqual({
      action: "toggleOutline",
      pending: null,
    });
  });

  it("drops the C-c prefix when another key follows", () => {
    expect(resolveAction("emacs", stroke("x"), "C-c")).toStrictEqual({
      action: null,
      pending: null,
    });
  });

  it("ignores an unmodified j", () => {
    expect(resolveAction("emacs", stroke("j"), null)).toStrictEqual({
      action: null,
      pending: null,
    });
  });
});

describe("resolveAction when keybindings are disabled", () => {
  it.each([
    ["j", {}],
    ["t", {}],
    ["n", { ctrlKey: true }],
  ])("ignores %s", (key, modifiers) => {
    expect(resolveAction("none", stroke(key, modifiers), null)).toStrictEqual({
      action: null,
      pending: null,
    });
  });
});

describe("resolveAction on the arrow keys", () => {
  const modes: KeybindingMode[] = ["vim", "emacs", "none"];
  const arrows: [string, ViewerAction][] = [
    ["ArrowRight", "nextPage"],
    ["ArrowLeft", "prevPage"],
    ["ArrowDown", "scrollDown"],
    ["ArrowUp", "scrollUp"],
  ];

  it.each(modes.flatMap((mode) => arrows.map(([key, action]) => [mode, key, action] as const)))(
    "maps %s mode's %s to %s, since the arrows belong to every mode",
    (mode, key, action) => {
      expect(resolveAction(mode, stroke(key), null)).toStrictEqual({ action, pending: null });
    },
  );

  it.each(arrows.map(([key]) => key))(
    "leaves shift+%s to the browser, so the reader can extend a selection",
    (key) => {
      expect(resolveAction("none", stroke(key, { shiftKey: true }), null)).toStrictEqual({
        action: null,
        pending: null,
      });
    },
  );

  it.each([
    ["ctrlKey", { ctrlKey: true }],
    ["altKey", { altKey: true }],
    ["metaKey", { metaKey: true }],
  ])("leaves ArrowRight with %s to the browser", (_name, modifiers) => {
    expect(resolveAction("none", stroke("ArrowRight", modifiers), null)).toStrictEqual({
      action: null,
      pending: null,
    });
  });

  it("resolves an arrow that follows vim's pending g and drops the prefix", () => {
    expect(resolveAction("vim", stroke("ArrowDown"), "g")).toStrictEqual({
      action: "scrollDown",
      pending: null,
    });
  });
});
