import { describe, it, expect } from "vite-plus/test";
import { parseCitations } from "./chatService";

/** pdfLoader が作る fullText と同じ形 (ページ区切りは \f) */
function fullTextOf(...pages: string[]): string {
  return pages.join("\f");
}

describe("parseCitations", () => {
  it("resolves the page of a Japanese-quoted pdf citation to the page holding the passage", () => {
    const fullText = fullTextOf(
      "まえがき",
      "第1章 Cloudflare Workers とは",
      "エッジ は サーバーレス 実行基盤 です",
    );
    const response = `エッジで動きます[1]\n\n## Sources\n[1] 「エッジはサーバーレス実行基盤です」（本書 第3章 3.1）`;

    expect(parseCitations(response, fullText, 3)).toStrictEqual([
      { id: "1", type: "pdf", text: "エッジはサーバーレス実行基盤です", pageNumber: 3 },
    ]);
  });

  it("resolves a passage split across two pages to the page it starts on", () => {
    const fullText = fullTextOf("まえがき", "Workers は グローバル", "ネットワーク で 動きます");
    const response = `本文[1]\n\n## Sources\n[1] 「Workersはグローバルネットワークで動きます」`;

    expect(parseCitations(response, fullText, 3)).toStrictEqual([
      { id: "1", type: "pdf", text: "Workersはグローバルネットワークで動きます", pageNumber: 2 },
    ]);
  });

  it("still finds the page when the model paraphrased part of the passage", () => {
    const fullText = fullTextOf(
      "まえがき",
      "TLS の ハンドシェイク では、クライアント ／ サーバ間 での ラウンドトリップ が発生するため、一定の時間が必要となります",
    );
    // The opening was reworded, but the rest is quoted from the page
    const response = `本文[1]\n\n## Sources\n[1] 「TLSハンドシェイク処理では、クライアント／サーバ間でのラウンドトリップが発生するため、一定の時間が必要となります」`;

    expect(parseCitations(response, fullText, 2)).toStrictEqual([
      {
        id: "1",
        type: "pdf",
        text: "TLSハンドシェイク処理では、クライアント／サーバ間でのラウンドトリップが発生するため、一定の時間が必要となります",
        pageNumber: 2,
      },
    ]);
  });

  it("leaves the page unresolved when the quoted passage is not in the document", () => {
    const fullText = fullTextOf("まえがき", "第1章 Cloudflare Workers とは");
    const response = `本文[1]\n\n## Sources\n[1] 「この文は本文に存在しません」`;

    expect(parseCitations(response, fullText, 2)).toStrictEqual([
      { id: "1", type: "pdf", text: "この文は本文に存在しません", pageNumber: undefined },
    ]);
  });

  it("keeps a web citation as a url reference without a page number", () => {
    const fullText = fullTextOf("まえがき", "第1章");
    const response = `本文[1]\n\n## Sources\n[1] Cloudflare Docs - https://developers.cloudflare.com/workers/`;

    expect(parseCitations(response, fullText, 2)).toStrictEqual([
      {
        id: "1",
        type: "web",
        text: "Cloudflare Docs",
        url: "https://developers.cloudflare.com/workers/",
      },
    ]);
  });

  it("estimates the page by position when the stored full text has no page delimiters", () => {
    // 再アップロード前の古いレコードは改行区切りのまま残っている
    const fullText = `${"a".repeat(100)}\n${"b".repeat(100)}目的の文${"c".repeat(100)}`;
    const response = `本文[1]\n\n## Sources\n[1] 「目的の文」`;

    expect(parseCitations(response, fullText, 3)).toStrictEqual([
      { id: "1", type: "pdf", text: "目的の文", pageNumber: 2 },
    ]);
  });

  it("returns no citations when the answer has no Sources section", () => {
    expect(parseCitations("出典のない回答です", fullTextOf("本文"), 1)).toStrictEqual([]);
  });
});
