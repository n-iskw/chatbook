import { describe, it, expect } from "vite-plus/test";
import { tidySelectionRects, dropGuardRect } from "./selectionRects";

describe("dropGuardRect", () => {
  const line = { x: 367, y: 219, width: 222, height: 16 };
  // While a drag is in progress the selection guard is stretched over the whole
  // page; a selection that swallows it gets the page as one more rect
  const guard = { x: 256, y: 63, width: 864, height: 1226 };

  it("drops the page-sized rect the guard contributes", () => {
    expect(dropGuardRect([line, guard], guard)).toStrictEqual([line]);
  });

  it("drops it despite the sub-pixel drift between two measurements", () => {
    const measuredAgain = { x: 255.6, y: 63.4, width: 864.3, height: 1226.4 };

    expect(dropGuardRect([line, measuredAgain], guard)).toStrictEqual([line]);
  });

  it("keeps a line that merely starts where the guard does", () => {
    const wideLine = { x: 256, y: 63, width: 864, height: 19 };

    expect(dropGuardRect([wideLine], guard)).toStrictEqual([wideLine]);
  });

  it("keeps every rect when there is no guard to compare against", () => {
    expect(dropGuardRect([line], null)).toStrictEqual([line]);
  });
});

describe("tidySelectionRects", () => {
  it("joins the pieces of a line, because the gaps between them are selected too", () => {
    // Shape measured from a real selection: pdf.js gives each phrase its own
    // span, so one line comes back as several rects with 30-40px gaps between
    // them, plus a near-duplicate that differs only in height
    const rects = [
      { x: 367, y: 219, width: 222, height: 16 },
      { x: 630, y: 220, width: 145, height: 16 },
      { x: 630, y: 220, width: 145, height: 15 },
      { x: 806, y: 220, width: 5, height: 16 },
      { x: 808, y: 219, width: 32, height: 16 },
    ];

    expect(tidySelectionRects(rects)).toStrictEqual([{ x: 367, y: 219, width: 473, height: 17 }]);
  });

  it("keeps the lines of a multi-line selection apart", () => {
    const rects = [
      { x: 367, y: 187, width: 574, height: 16 },
      { x: 367, y: 219, width: 222, height: 16 },
      { x: 630, y: 220, width: 145, height: 16 },
    ];

    expect(tidySelectionRects(rects)).toStrictEqual([
      { x: 367, y: 187, width: 574, height: 16 },
      { x: 367, y: 219, width: 408, height: 17 },
    ]);
  });

  it("ignores the zero-width caret rect that comes with a selection", () => {
    const rects = [
      { x: 256, y: 62, width: 0, height: 19 },
      { x: 367, y: 219, width: 222, height: 16 },
    ];

    expect(tidySelectionRects(rects)).toStrictEqual([{ x: 367, y: 219, width: 222, height: 16 }]);
  });

  it("returns nothing for a selection that has collapsed to a caret", () => {
    expect(tidySelectionRects([{ x: 5, y: 5, width: 0, height: 18 }])).toStrictEqual([]);
  });
});
