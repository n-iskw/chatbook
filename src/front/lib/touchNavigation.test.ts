import { describe, it, expect } from "vite-plus/test";
import { pinchZoom, resolveSwipe, resolveTapZone, TAP_EDGE } from "./touchNavigation";
import { MIN_ZOOM, MAX_ZOOM } from "./pageScale";

describe("resolveTapZone", () => {
  it("turns back from a tap on the left edge", () => {
    expect(resolveTapZone(0.1)).toBe("prev");
  });

  it("turns on from a tap on the right edge", () => {
    expect(resolveTapZone(0.9)).toBe("next");
  });

  it("leaves the middle to the zoom, so a double tap is not two page turns", () => {
    expect(resolveTapZone(0.5)).toBe("zoom");
  });

  it("counts the edge itself as the middle, so neither band can turn a tap twice", () => {
    expect(resolveTapZone(TAP_EDGE)).toBe("zoom");
    expect(resolveTapZone(1 - TAP_EDGE)).toBe("zoom");
  });
});

describe("resolveSwipe", () => {
  it("turns on when the finger travels left across the page", () => {
    expect(resolveSwipe({ dx: -120, dy: 10, durationMs: 200 })).toBe("next");
  });

  it("turns back when the finger travels right across the page", () => {
    expect(resolveSwipe({ dx: 120, dy: 10, durationMs: 200 })).toBe("prev");
  });

  it("reads a scroll down the page as a scroll, however far sideways it wanders", () => {
    expect(resolveSwipe({ dx: -80, dy: 200, durationMs: 200 })).toBeNull();
  });

  it("ignores a nudge too small to have been meant as a swipe", () => {
    expect(resolveSwipe({ dx: -20, dy: 2, durationMs: 200 })).toBeNull();
  });

  it("ignores a finger dragged slowly, which is a reader moving the page about", () => {
    expect(resolveSwipe({ dx: -120, dy: 10, durationMs: 1500 })).toBeNull();
  });
});

describe("pinchZoom", () => {
  it("enlarges the page by however far the fingers spread", () => {
    expect(pinchZoom(1, 2)).toBe(2);
  });

  it("shrinks the page by however far the fingers close", () => {
    expect(pinchZoom(2, 0.5)).toBe(1);
  });

  it("stops enlarging at the largest zoom the viewer offers", () => {
    expect(pinchZoom(MAX_ZOOM, 3)).toBe(MAX_ZOOM);
  });

  it("stops shrinking at the smallest zoom the viewer offers", () => {
    expect(pinchZoom(MIN_ZOOM, 0.1)).toBe(MIN_ZOOM);
  });
});
