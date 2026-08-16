import { describe, expect, it } from "vitest";
import { outlineNeedsRepair, sortOutlineByPage } from "./outlineOrder";

describe("sortOutlineByPage", () => {
  it("sorts roots and children by their destination page", () => {
    const outline = sortOutlineByPage([
      {
        title: "第12章",
        pageNumber: 12,
        children: [
          { title: "12.2", pageNumber: 18, children: [] },
          { title: "12.1", pageNumber: 14, children: [] },
        ],
      },
      { title: "第1章", pageNumber: 40, children: [] },
      { title: "第2章", pageNumber: 29, children: [] },
      { title: "不明", pageNumber: null, children: [] },
    ]);

    expect(outline.map((entry) => entry.pageNumber)).toStrictEqual([12, 29, 40, null]);
    expect(outline[0].children.map((entry) => entry.pageNumber)).toStrictEqual([14, 18]);
  });
});

describe("outlineNeedsRepair", () => {
  it("recognizes the old OCR outline whose chapters are out of order", () => {
    expect(
      outlineNeedsRepair([
        { title: "第12章 パフォーマンス最適化", pageNumber: 12, children: [] },
        { title: "第2章 で詳しく解説します。", pageNumber: 29, children: [] },
      ]),
    ).toBe(true);
  });

  it("accepts a chapter-ordered outline with unresolved excerpt destinations", () => {
    expect(
      outlineNeedsRepair([
        { title: "第1章 はじめに", pageNumber: 14, children: [] },
        { title: "第2章 仕組み", pageNumber: 52, children: [] },
        { title: "第3章 カタログ", pageNumber: null, children: [] },
      ]),
    ).toBe(false);
  });
});
