import { describe, it, expect } from "vitest";
import { isSubmitKey, type SubmitKeyEvent } from "./isSubmitKey";

function keyEvent(overrides: Partial<SubmitKeyEvent> = {}): SubmitKeyEvent {
  return {
    key: "Enter",
    shiftKey: false,
    isComposing: false,
    keyCode: 13,
    ...overrides,
  };
}

describe("isSubmitKey", () => {
  it("submits on a plain Enter", () => {
    expect(isSubmitKey(keyEvent())).toBe(true);
  });

  it("does not submit while an IME composition is active", () => {
    expect(isSubmitKey(keyEvent({ isComposing: true }))).toBe(false);
  });

  it("does not submit on the keyCode 229 an IME reports", () => {
    // Safari does not set isComposing on the Enter that confirms a conversion
    expect(isSubmitKey(keyEvent({ isComposing: false, keyCode: 229 }))).toBe(false);
  });

  it("does not submit on Shift+Enter, which inserts a newline", () => {
    expect(isSubmitKey(keyEvent({ shiftKey: true }))).toBe(false);
  });

  it("ignores keys other than Enter", () => {
    expect(isSubmitKey(keyEvent({ key: "a", keyCode: 65 }))).toBe(false);
  });
});
