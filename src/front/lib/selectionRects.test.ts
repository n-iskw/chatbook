import { describe, it, expect } from "vite-plus/test";
import { tidySelectionRects } from "./selectionRects";

describe("tidySelectionRects", () => {
  it("keeps one rect per line of a multi-line selection", () => {
    // Shape measured from a real 3-span selection: three lines, one zero-width
    // caret rect, and a duplicate that differs only in height
    const rects = [
      { x: 367, y: 186.9, width: 573.9, height: 15.6 },
      { x: 256, y: 62.3, width: 0, height: 18.9 },
      { x: 367, y: 219.4, width: 221.9, height: 16 },
      { x: 367, y: 219.4, width: 221.9, height: 15.6 },
      { x: 629.5, y: 220.2, width: 145.2, height: 15.6 },
    ];

    expect(tidySelectionRects(rects)).toEqual([
      { x: 367, y: 186.9, width: 573.9, height: 15.6 },
      { x: 367, y: 219.4, width: 221.9, height: 16 },
      { x: 629.5, y: 220.2, width: 145.2, height: 15.6 },
    ]);
  });

  it("drops a rect that another one already covers", () => {
    const rects = [
      { x: 10, y: 10, width: 100, height: 20 },
      { x: 20, y: 12, width: 40, height: 10 },
    ];

    expect(tidySelectionRects(rects)).toEqual([{ x: 10, y: 10, width: 100, height: 20 }]);
  });

  it("keeps rects that only touch, since each covers text the other does not", () => {
    const rects = [
      { x: 10, y: 10, width: 100, height: 20 },
      { x: 110, y: 10, width: 80, height: 20 },
    ];

    expect(tidySelectionRects(rects)).toEqual(rects);
  });

  it("returns nothing for a selection that has collapsed to a caret", () => {
    expect(tidySelectionRects([{ x: 5, y: 5, width: 0, height: 18 }])).toEqual([]);
  });
});
