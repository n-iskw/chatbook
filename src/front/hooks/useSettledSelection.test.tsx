import { describe, it, expect, vi, beforeEach, afterEach } from "vite-plus/test";
import { renderHook, act } from "@testing-library/react";
import { SELECTION_SETTLE_MS, useSettledSelection } from "./useSettledSelection";

/** Announce a new selection the way the browser does while one is being made. */
function announceSelection() {
  document.dispatchEvent(new Event("selectionchange"));
}

function pressPointer(pointerType = "mouse") {
  window.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType }));
}

function releasePointer(pointerType = "mouse") {
  window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerType }));
}

/** Let the settle wait run out, whether or not one was due. */
function waitOutTheSettle(times = 1) {
  act(() => {
    vi.advanceTimersByTime(SELECTION_SETTLE_MS * times);
  });
}

/** A pause shorter than the settle wait, which is what makes changes one run. */
function pauseWithinTheRun() {
  act(() => {
    vi.advanceTimersByTime(Math.floor(SELECTION_SETTLE_MS / 4));
  });
}

describe("useSettledSelection", () => {
  // Driven rather than waited on: what this hook is for is a length of time, so
  // every assertion here is about where the clock is. Real waits made the whole
  // suite slower and, under a loaded machine, made "has not fired yet" a guess.
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reads the selection once the drag that made it is over", () => {
    const onSettled = vi.fn();
    renderHook(() => useSettledSelection(onSettled));

    act(() => pressPointer());
    announceSelection();
    act(() => releasePointer());
    waitOutTheSettle();

    expect(onSettled.mock.calls).toStrictEqual([["mouse"]]);
  });

  it("reads it once for a run of changes, not once per change", () => {
    // Dragging over a paragraph announces a new selection the whole way. Each
    // one is a passage still being chosen, not one to act on.
    const onSettled = vi.fn();
    renderHook(() => useSettledSelection(onSettled));

    act(() => pressPointer());
    announceSelection();
    pauseWithinTheRun();
    announceSelection();
    pauseWithinTheRun();
    announceSelection();
    act(() => releasePointer());
    waitOutTheSettle();

    expect(onSettled).toHaveBeenCalledTimes(1);
    // Once it has settled it stays settled: a hook that had lost track of the
    // earlier changes would go off again as each of their waits ran out.
    waitOutTheSettle(4);
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it("waits for the finger or button to come up before reading", () => {
    // Still pressed means the passage is still growing, however still the
    // selection has been in the meantime.
    const onSettled = vi.fn();
    renderHook(() => useSettledSelection(onSettled));

    act(() => pressPointer());
    announceSelection();
    waitOutTheSettle(4);

    expect(onSettled).not.toHaveBeenCalled();

    act(() => releasePointer());
    waitOutTheSettle();

    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it("still reads where the platform reports no pointer at all", () => {
    // iOS drags its own selection handles without sending pointer events. With
    // nothing ever reported as pressed, this has to fall back to waiting out
    // the run of changes — which is what the phone did before.
    const onSettled = vi.fn();
    renderHook(() => useSettledSelection(onSettled));

    announceSelection();
    pauseWithinTheRun();
    announceSelection();
    waitOutTheSettle();

    expect(onSettled).toHaveBeenCalledTimes(1);
    waitOutTheSettle(4);
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it("says what the passage was chosen with", () => {
    // The offer a finger gets is not the one a mouse gets, and the only thing
    // that tells them apart is the pointer that was last put down.
    const onSettled = vi.fn();
    renderHook(() => useSettledSelection(onSettled));

    act(() => pressPointer("touch"));
    announceSelection();
    act(() => releasePointer("touch"));
    waitOutTheSettle();

    expect(onSettled.mock.calls).toStrictEqual([["touch"]]);
  });

  it("says nothing about the pointer where none was ever reported", () => {
    // iOS drags its own handles without sending pointer events. Guessing
    // "mouse" from the silence would put the mouse's question box on a phone.
    const onSettled = vi.fn();
    renderHook(() => useSettledSelection(onSettled));

    announceSelection();
    waitOutTheSettle();

    expect(onSettled.mock.calls).toStrictEqual([[null]]);
  });

  it("stays quiet while it is switched off, and picks up again when it is not", () => {
    // The question box collapses the selection when it takes focus; answering
    // that would close the box the reader just opened. Closing the box has to
    // hand the passage back, so the silence cannot be permanent.
    const onSettled = vi.fn();
    const { rerender } = renderHook(({ enabled }) => useSettledSelection(onSettled, { enabled }), {
      initialProps: { enabled: false },
    });

    announceSelection();
    waitOutTheSettle(4);

    expect(onSettled).not.toHaveBeenCalled();

    rerender({ enabled: true });
    announceSelection();
    waitOutTheSettle();

    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it("stops listening once the component is gone", () => {
    const onSettled = vi.fn();
    const { unmount } = renderHook(() => useSettledSelection(onSettled));

    // Reading once while it is mounted is what makes the silence afterwards
    // mean the listeners were taken down, rather than never put up
    announceSelection();
    waitOutTheSettle();
    expect(onSettled).toHaveBeenCalledTimes(1);

    unmount();
    announceSelection();
    waitOutTheSettle(4);

    expect(onSettled).toHaveBeenCalledTimes(1);
  });
});
