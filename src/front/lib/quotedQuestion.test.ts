import { describe, it, expect } from "vite-plus/test";
import { formatQuotedQuestion } from "./quotedQuestion";

describe("formatQuotedQuestion", () => {
  it("puts a one-line quote above the question as a markdown blockquote", () => {
    const message = formatQuotedQuestion("エッジはメモリを共有できません", "なぜですか");

    expect(message).toBe("> エッジはメモリを共有できません\n\nなぜですか");
  });

  it("quotes every line of a passage dragged across several lines", () => {
    const message = formatQuotedQuestion("一行目\n二行目", "どういう意味ですか");

    expect(message).toBe("> 一行目\n> 二行目\n\nどういう意味ですか");
  });

  it("keeps the blank line between quoted paragraphs inside the quote", () => {
    // A quote whose empty line is left unprefixed would end the blockquote, so
    // the second paragraph would read as part of the question instead.
    const message = formatQuotedQuestion("前の段落\n\n次の段落", "違いは何ですか");

    expect(message).toBe("> 前の段落\n>\n> 次の段落\n\n違いは何ですか");
  });

  it("drops the whitespace a drag picks up at the edges of the passage", () => {
    const message = formatQuotedQuestion("\n  引用したい文  \n", "これは何ですか");

    expect(message).toBe("> 引用したい文\n\nこれは何ですか");
  });
});
