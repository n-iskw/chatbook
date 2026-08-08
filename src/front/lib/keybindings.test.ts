import { describe, it, expect } from "vitest";
import { resolveAction, type KeyStroke } from "./keybindings";

/** Minimal stand-in for the parts of KeyboardEvent the resolver reads. */
function stroke(key: string, modifiers: Partial<KeyStroke> = {}): KeyStroke {
  return { key, ctrlKey: false, altKey: false, metaKey: false, shiftKey: false, ...modifiers };
}

describe("resolveAction in vim mode", () => {
  it("maps j to the next page", () => {
    expect(resolveAction("vim", stroke("j"), null)).toEqual({ action: "nextPage", pending: null });
  });

  it("maps k to the previous page", () => {
    expect(resolveAction("vim", stroke("k"), null)).toEqual({ action: "prevPage", pending: null });
  });

  it("maps t to toggling the outline", () => {
    expect(resolveAction("vim", stroke("t"), null)).toEqual({
      action: "toggleOutline",
      pending: null,
    });
  });

  it("maps G to the last page", () => {
    expect(resolveAction("vim", stroke("G", { shiftKey: true }), null)).toEqual({
      action: "lastPage",
      pending: null,
    });
  });

  it("waits for a second g before jumping to the first page", () => {
    const first = resolveAction("vim", stroke("g"), null);
    expect(first).toEqual({ action: null, pending: "g" });

    expect(resolveAction("vim", stroke("g"), first.pending)).toEqual({
      action: "firstPage",
      pending: null,
    });
  });

  it("drops the pending g when an unrelated key follows", () => {
    expect(resolveAction("vim", stroke("x"), "g")).toEqual({ action: null, pending: null });
  });

  it("still resolves a normal binding that follows a dropped prefix", () => {
    expect(resolveAction("vim", stroke("j"), "g")).toEqual({ action: "nextPage", pending: null });
  });

  it("ignores emacs strokes", () => {
    expect(resolveAction("vim", stroke("n", { ctrlKey: true }), null)).toEqual({
      action: null,
      pending: null,
    });
  });
});

describe("resolveAction in emacs mode", () => {
  it("maps C-n to the next page", () => {
    expect(resolveAction("emacs", stroke("n", { ctrlKey: true }), null)).toEqual({
      action: "nextPage",
      pending: null,
    });
  });

  it("maps C-p to the previous page", () => {
    expect(resolveAction("emacs", stroke("p", { ctrlKey: true }), null)).toEqual({
      action: "prevPage",
      pending: null,
    });
  });

  it("maps M-< to the first page", () => {
    expect(resolveAction("emacs", stroke("<", { altKey: true, shiftKey: true }), null)).toEqual({
      action: "firstPage",
      pending: null,
    });
  });

  it("maps M-> to the last page", () => {
    expect(resolveAction("emacs", stroke(">", { altKey: true, shiftKey: true }), null)).toEqual({
      action: "lastPage",
      pending: null,
    });
  });

  it("toggles the outline with the C-c t sequence", () => {
    const prefix = resolveAction("emacs", stroke("c", { ctrlKey: true }), null);
    expect(prefix).toEqual({ action: null, pending: "C-c" });

    expect(resolveAction("emacs", stroke("t"), prefix.pending)).toEqual({
      action: "toggleOutline",
      pending: null,
    });
  });

  it("drops the C-c prefix when another key follows", () => {
    expect(resolveAction("emacs", stroke("x"), "C-c")).toEqual({ action: null, pending: null });
  });

  it("ignores an unmodified j", () => {
    expect(resolveAction("emacs", stroke("j"), null)).toEqual({ action: null, pending: null });
  });
});

describe("resolveAction when keybindings are disabled", () => {
  it.each([
    ["j", {}],
    ["t", {}],
    ["n", { ctrlKey: true }],
  ])("ignores %s", (key, modifiers) => {
    expect(resolveAction("none", stroke(key, modifiers), null)).toEqual({
      action: null,
      pending: null,
    });
  });
});
