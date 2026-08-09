import { describe, it, expect } from "vite-plus/test";
import { fitPageScale, nextZoom, MIN_ZOOM, MAX_ZOOM } from "./pageScale";

/** A4 at scale 1, the size the fixture book is drawn at. */
const A4 = { baseWidth: 595, baseHeight: 842 };

describe("fitPageScale", () => {
  it("fits the page to the pane's height when the pane is wider than the page is tall", () => {
    const scale = fitPageScale(A4, { width: 1000, height: 421 });

    expect(scale).toBe(0.5);
  });

  it("fits the page to the pane's width when the pane is too narrow for the height fit", () => {
    const scale = fitPageScale(A4, { width: 297.5, height: 842 });

    expect(scale).toBe(0.5);
  });
});

describe("nextZoom", () => {
  it("enlarges the page when the pinch spreads (a negative wheel delta)", () => {
    expect(nextZoom(1, -100)).toBe(1.5);
  });

  it("shrinks the page when the pinch closes (a positive wheel delta)", () => {
    expect(nextZoom(2, 100)).toBe(1);
  });

  it("stops enlarging at the largest zoom the viewer offers", () => {
    expect(nextZoom(MAX_ZOOM, -100)).toBe(MAX_ZOOM);
  });

  it("stops shrinking at the smallest zoom the viewer offers", () => {
    expect(nextZoom(MIN_ZOOM, 100)).toBe(MIN_ZOOM);
  });

  it("clamps a pinch large enough to invert the page to the smallest zoom", () => {
    // A trackpad can report a delta past 1/SENSITIVITY in one event, which
    // multiplied out would flip the page inside out.
    expect(nextZoom(1, 1000)).toBe(MIN_ZOOM);
  });
});
