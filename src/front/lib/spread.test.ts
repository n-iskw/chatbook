import { describe, it, expect } from "vite-plus/test";
import { fitsTwoPages, visiblePages, turnTo, lastSpreadStart } from "./spread";
import { MIN_ZOOM } from "./pageScale";

/** A4 at scale 1, the size the fixture book is drawn at. */
const A4 = { baseWidth: 595, baseHeight: 842 };

/**
 * A pane exactly as tall as an A4 page, where that page comes out 595px wide.
 * Two of them plus the 8px gap need 1198px.
 */
const A4_HEIGHT = 842;
const TWO_A4_AND_A_GAP = 1198;

describe("fitsTwoPages", () => {
  it("takes two pages when the pane has room for both at the size one would be drawn at", () => {
    expect(fitsTwoPages(A4, { width: TWO_A4_AND_A_GAP, height: A4_HEIGHT }, 1)).toBe(true);
  });

  it("leaves one page up when the pane is a pixel short of two", () => {
    // A page shown beside another has to be no smaller than it would be alone,
    // so being a hair too narrow keeps the reader on one page rather than
    // shrinking both to make them fit.
    expect(fitsTwoPages(A4, { width: TWO_A4_AND_A_GAP - 1, height: A4_HEIGHT }, 1)).toBe(false);
  });

  it("leaves one page up in a pane as wide as a phone", () => {
    expect(fitsTwoPages(A4, { width: 390, height: 700 }, 1)).toBe(false);
  });

  it("leaves one page up in a pane whose height has not been measured yet", () => {
    // Zero height would make every page nought pixels wide, and any pane at all
    // would then look wide enough for two of them.
    expect(fitsTwoPages(A4, { width: 1280, height: 0 }, 1)).toBe(false);
  });

  it("leaves one page up in a pane whose width has not been measured yet", () => {
    // The viewer fills its size in from a ResizeObserver, so the first render
    // asks this question of a pane that has no width yet.
    expect(fitsTwoPages(A4, { width: 0, height: 700 }, 1)).toBe(false);
  });

  it("takes two pages in a pane too narrow for them until the reader zooms out", () => {
    // 900px holds one A4 fitted to its height (595px) but not two, and the
    // reader shrinking the page to 70% leaves 416px each: two of those and the
    // gap come to 841px.
    const pane = { width: 900, height: A4_HEIGHT };
    expect(fitsTwoPages(A4, pane, 1)).toBe(false);
    expect(fitsTwoPages(A4, pane, 0.7)).toBe(true);
  });

  it("leaves one page up once the reader zooms in past what the pane holds twice", () => {
    // The page the reader enlarged is the one they want to see, so the second
    // page gives way rather than both being squeezed back to fitting.
    expect(fitsTwoPages(A4, { width: TWO_A4_AND_A_GAP, height: A4_HEIGHT }, 1.2)).toBe(false);
  });

  it("keeps two pages up when the reader zooms in and the pane still holds both", () => {
    // Zooming in is not on its own a reason to put the second page away: a wide
    // enough pane holds two enlarged pages, and 1600px holds two at 120%.
    expect(fitsTwoPages(A4, { width: 1600, height: A4_HEIGHT }, 1.2)).toBe(true);
  });

  it("leaves one page up in a phone's pane at the furthest the reader can zoom out", () => {
    // Zooming out is bounded, and a phone is short of two pages by more than
    // the bound gives back: the reader cannot reach a spread from here.
    expect(fitsTwoPages(A4, { width: 390, height: 700 }, MIN_ZOOM)).toBe(false);
  });
});

describe("visiblePages", () => {
  it("puts the page the reader is on beside the one after it in a spread", () => {
    expect(visiblePages(7, 12, true)).toStrictEqual([7, 8]);
  });

  it("shows the last page of a book on its own when nothing follows it", () => {
    expect(visiblePages(12, 12, true)).toStrictEqual([12]);
  });

  it("shows the page alone when the pane only has room for one", () => {
    expect(visiblePages(7, 12, false)).toStrictEqual([7]);
  });
});

describe("turnTo", () => {
  it("moves on by one page in a pane showing one", () => {
    expect(turnTo(7, "next", 12, 1)).toBe(8);
  });

  it("moves on by the whole spread in a pane showing two", () => {
    expect(turnTo(7, "next", 12, 2)).toBe(9);
  });

  it("moves back by the whole spread in a pane showing two", () => {
    expect(turnTo(9, "prev", 12, 2)).toBe(7);
  });

  it("stays on the last page of a book asked to move past it", () => {
    expect(turnTo(12, "next", 12, 1)).toBe(12);
  });

  it("stays on the last spread rather than turning past the end of the book", () => {
    // [11|12] is the end of a twelve page book: the turn would land on 13.
    expect(turnTo(11, "next", 12, 2)).toBe(11);
  });

  it("takes the last page on its own when a spread leaves one page over", () => {
    // [10|11] is reached by following a link rather than by reading forward,
    // and 12 is a page the reader has not seen: stopping here would leave it
    // out of reach of every control that turns pages.
    expect(turnTo(10, "next", 12, 2)).toBe(12);
  });

  it("takes the last spread of a book with an odd number of pages", () => {
    expect(turnTo(8, "next", 11, 2)).toBe(10);
  });

  it("stays on the first page asked to move back from it", () => {
    expect(turnTo(1, "prev", 12, 2)).toBe(1);
  });

  it("lands on the first page rather than before it when the spread straddles it", () => {
    expect(turnTo(2, "prev", 12, 2)).toBe(1);
  });
});

describe("lastSpreadStart", () => {
  it("ends a spread reader on the last two pages of the book", () => {
    expect(lastSpreadStart(12, 2)).toBe(11);
  });

  it("ends a one page reader on the last page", () => {
    expect(lastSpreadStart(12, 1)).toBe(12);
  });

  it("stays on the only page of a one page book", () => {
    expect(lastSpreadStart(1, 2)).toBe(1);
  });
});
