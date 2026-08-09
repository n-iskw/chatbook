import { describe, it, expect } from "vite-plus/test";
import { stripSources } from "./stripSources";

describe("stripSources", () => {
  it("drops the Sources section so the answer ends with its last sentence", () => {
    const answer = `Workers はエッジで動きます[1]。\n\n## Sources\n[1] 「エッジで動きます」（本書 第1章）`;

    expect(stripSources(answer)).toBe("Workers はエッジで動きます[1]。");
  });

  it("keeps an answer that has no Sources section unchanged", () => {
    expect(stripSources("出典のない回答です。")).toBe("出典のない回答です。");
  });

  it("keeps a heading that merely mentions sources in prose", () => {
    const answer = "## Sources of truth\n設定ファイルが唯一の情報源です。";

    expect(stripSources(answer)).toBe(answer);
  });
});
