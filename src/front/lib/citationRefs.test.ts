import { describe, it, expect } from "vite-plus/test";
import { linkifyCitationRefs, citationIdFromHref } from "./citationRefs";

describe("linkifyCitationRefs", () => {
  it("rewrites a marker that names a source into a link carrying that source's id", () => {
    expect(linkifyCitationRefs("Workers はエッジで動きます[1]。", new Set(["1"]))).toBe(
      "Workers はエッジで動きます[[1]](#citation-1)。",
    );
  });

  it("rewrites every marker of a run, so two sources in a row both become links", () => {
    expect(linkifyCitationRefs("根拠は[1][2]です。", new Set(["1", "2"]))).toBe(
      "根拠は[[1]](#citation-1)[[2]](#citation-2)です。",
    );
  });

  it("leaves a marker whose source the answer never listed as it is", () => {
    expect(linkifyCitationRefs("根拠は[1]と[2]です。", new Set(["1"]))).toBe(
      "根拠は[[1]](#citation-1)と[2]です。",
    );
  });

  // An index is not a citation, and a fence is exactly where indexes live
  it("leaves a subscript inside a fenced code block alone", () => {
    expect(linkifyCitationRefs("```js\nconst first = items[1];\n```", new Set(["1"]))).toBe(
      "```js\nconst first = items[1];\n```",
    );
  });

  it("leaves a subscript inside an inline code span alone", () => {
    expect(linkifyCitationRefs("`items[1]` を読みます", new Set(["1"]))).toBe(
      "`items[1]` を読みます",
    );
  });

  it("leaves a link that already has a destination alone", () => {
    expect(linkifyCitationRefs("[1](https://example.com) を見る", new Set(["1"]))).toBe(
      "[1](https://example.com) を見る",
    );
  });

  it("leaves an image alone, whose alt text a link would break", () => {
    expect(linkifyCitationRefs("![1](/cover.png)", new Set(["1"]))).toBe("![1](/cover.png)");
  });
});

describe("citationIdFromHref", () => {
  it("reads back the id a rewritten marker carries", () => {
    expect(citationIdFromHref("#citation-12")).toBe("12");
  });

  it("returns null for a link the answer wrote itself", () => {
    expect(citationIdFromHref("https://example.com")).toBeNull();
  });

  it("returns null for a link with no destination at all", () => {
    expect(citationIdFromHref(undefined)).toBeNull();
  });
});
