import { describe, it, expect, vi } from "vite-plus/test";
import { renderHook, act, waitFor } from "@testing-library/react";
import { SELECTION_SETTLE_MS, useSettledSelection } from "./useSettledSelection";

/** Announce a new selection the way the browser does while one is being made. */
function announceSelection() {
  document.dispatchEvent(new Event("selectionchange"));
}

function pressPointer() {
  window.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
}

function releasePointer() {
  window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
}

/** Longer than the settle wait, so a run that was going to happen has. */
const AFTER_SETTLING = SELECTION_SETTLE_MS + 80;

describe("useSettledSelection", () => {
  it("reads the selection once it has stopped changing", async () => {
    const onSettled = vi.fn();
    renderHook(() => useSettledSelection(onSettled));

    announceSelection();

    await waitFor(() => expect(onSettled).toHaveBeenCalledTimes(1));
  });

  it("reads it once for a run of changes, not once per change", async () => {
    // Dragging over a paragraph announces a new selection the whole way. Each
    // one is a passage still being chosen, not one to act on.
    const onSettled = vi.fn();
    renderHook(() => useSettledSelection(onSettled));

    announceSelection();
    await new Promise((resolve) => setTimeout(resolve, 60));
    announceSelection();
    await new Promise((resolve) => setTimeout(resolve, 60));
    announceSelection();

    await waitFor(() => expect(onSettled).toHaveBeenCalledTimes(1));
  });

  it("waits for the finger or button to come up before reading", async () => {
    // Still pressed means the passage is still growing, however still the
    // selection has been in the meantime.
    const onSettled = vi.fn();
    renderHook(() => useSettledSelection(onSettled));

    act(() => pressPointer());
    announceSelection();
    await new Promise((resolve) => setTimeout(resolve, AFTER_SETTLING));

    expect(onSettled).not.toHaveBeenCalled();

    act(() => releasePointer());

    await waitFor(() => expect(onSettled).toHaveBeenCalledTimes(1));
  });

  it("still reads where the platform reports no pointer at all", async () => {
    // iOS drags its own selection handles without sending pointer events. With
    // nothing ever reported as pressed, this has to fall back to waiting out
    // the run of changes — which is what the phone did before.
    const onSettled = vi.fn();
    renderHook(() => useSettledSelection(onSettled));

    announceSelection();

    await waitFor(() => expect(onSettled).toHaveBeenCalledTimes(1));
  });

  it("stays quiet while it is switched off", async () => {
    // The question box collapses the selection when it takes focus; answering
    // that would close the box the reader just opened.
    const onSettled = vi.fn();
    renderHook(() => useSettledSelection(onSettled, { enabled: false }));

    announceSelection();
    await new Promise((resolve) => setTimeout(resolve, AFTER_SETTLING));

    expect(onSettled).not.toHaveBeenCalled();
  });

  it("stops listening once the component is gone", async () => {
    const onSettled = vi.fn();
    const { unmount } = renderHook(() => useSettledSelection(onSettled));

    unmount();
    announceSelection();
    await new Promise((resolve) => setTimeout(resolve, AFTER_SETTLING));

    expect(onSettled).not.toHaveBeenCalled();
  });
});
