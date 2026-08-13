import { describe, it, expect } from "vite-plus/test";
import { renderHook, act } from "@testing-library/react";
import { useIsNarrow } from "./useIsNarrow";
import { PHONE_WIDTH, setViewportWidth } from "../../test/viewport";
import { NARROW_MAX_WIDTH } from "../lib/viewport";

describe("useIsNarrow", () => {
  it("reports a roomy viewport as not narrow, so the reader keeps its panes", () => {
    const { result } = renderHook(() => useIsNarrow());

    expect(result.current).toBe(false);
  });

  it("reports a phone-width viewport as narrow", () => {
    setViewportWidth(PHONE_WIDTH);

    const { result } = renderHook(() => useIsNarrow());

    expect(result.current).toBe(true);
  });

  it("answers again when the window is resized past the breakpoint", () => {
    const { result } = renderHook(() => useIsNarrow());

    act(() => setViewportWidth(PHONE_WIDTH));

    expect(result.current).toBe(true);
  });

  it("answers again when the window grows back out of the narrow range", () => {
    setViewportWidth(PHONE_WIDTH);
    const { result } = renderHook(() => useIsNarrow());

    act(() => setViewportWidth(1024));

    expect(result.current).toBe(false);
  });

  // The breakpoint has to be the same number Tailwind's `md` uses, or a rule
  // written as `md:flex-row` and a branch taken here disagree about which
  // layout is on screen for exactly one pixel of width.
  it("counts the last width below Tailwind's md as narrow", () => {
    setViewportWidth(NARROW_MAX_WIDTH);

    const { result } = renderHook(() => useIsNarrow());

    expect(result.current).toBe(true);
  });

  it("counts Tailwind's md itself as roomy", () => {
    setViewportWidth(NARROW_MAX_WIDTH + 1);

    const { result } = renderHook(() => useIsNarrow());

    expect(result.current).toBe(false);
  });
});
