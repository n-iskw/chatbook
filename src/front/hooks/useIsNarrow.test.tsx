import { describe, it, expect } from "vite-plus/test";
import { renderHook, act } from "@testing-library/react";
import { useIsNarrow } from "./useIsNarrow";
import { PHONE_WIDTH, setViewportWidth } from "../../test/viewport";

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
});
