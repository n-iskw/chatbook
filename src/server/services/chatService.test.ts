import { describe, it, expect } from "vite-plus/test";
import { buildConversation, parseCitations, findPageNumber } from "./chatService";

/** pdfLoader が作る fullText と同じ形 (ページ区切りは \f) */
function fullTextOf(...pages: string[]): string {
  return pages.join("\f");
}

describe("buildConversation", () => {
  it("drops the Sources section from a past answer while leaving the reader's words whole", () => {
    // A reader can paste an answer back to ask about it, so a "## Sources"
    // line of their own must survive
    const quotedBack = `この回答の出典が気になります。\n\n## Sources\n[1] 「エッジ は サーバーレス 実行基盤 です」（本書 第3章）`;
    const history = [
      { role: "user", content: quotedBack },
      {
        role: "assistant",
        content: `エッジで動きます[1]。\n\n## Sources\n[1] 「エッジ は サーバーレス 実行基盤 です」（本書 第3章）`,
      },
    ];

    expect(buildConversation(history, "では冷スタートはどうですか?")).toStrictEqual([
      { role: "user", content: quotedBack },
      { role: "assistant", content: "エッジで動きます[1]。" },
      { role: "user", content: "では冷スタートはどうですか?" },
    ]);
  });
});

describe("findPageNumber", () => {
  it("reports the page a quoted passage was found on", () => {
    const fullText = fullTextOf("まえがき", "エッジ で 動く");

    expect(findPageNumber("エッジで動く", fullText, 2)).toStrictEqual({
      found: true,
      pageNumber: 2,
    });
  });

  it("reports a passage the book does not contain as one it does not hold", () => {
    const fullText = fullTextOf("まえがき", "エッジ で 動く");

    expect(findPageNumber("この本にない一文", fullText, 2)).toStrictEqual({
      found: false,
      miss: "not-in-book",
    });
  });

  it("reports a quote that is only whitespace as having no text to look up", () => {
    const fullText = fullTextOf("まえがき", "エッジ で 動く");

    expect(findPageNumber("  \n ", fullText, 2)).toStrictEqual({
      found: false,
      miss: "no-quote",
    });
  });

  it("blames the empty quote rather than the page count when a one-page book gets one", () => {
    expect(findPageNumber("  ", "エッジ で 動く", 1)).toStrictEqual({
      found: false,
      miss: "no-quote",
    });
  });

  it("says a book of one page has nowhere to jump to", () => {
    expect(findPageNumber("エッジで動く", "エッジ で 動く", 1)).toStrictEqual({
      found: false,
      miss: "single-page-book",
    });
  });

  // Books stored before the extractor delimited pages are searched by ratio, so
  // the passage has to sit in the second half to land on page 2
  const UNDELIMITED = "まえがき の ながい はじめに エッジ で 動く";

  it("estimates the page of a passage an undelimited book holds", () => {
    expect(findPageNumber("エッジで動く", UNDELIMITED, 2)).toStrictEqual({
      found: true,
      pageNumber: 2,
    });
  });

  it("reports a passage an undelimited book does not hold as one it does not hold", () => {
    expect(findPageNumber("この本にない一文", UNDELIMITED, 2)).toStrictEqual({
      found: false,
      miss: "not-in-book",
    });
  });
});

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

  it("says a quoted passage is not in the document rather than leaving the page blank", () => {
    // A quote the book does not hold is the reader's only hint that the model
    // reworded it, so the citation carries the reason instead of just no page.
    const fullText = fullTextOf("まえがき", "第1章 Cloudflare Workers とは");
    const response = `本文[1]\n\n## Sources\n[1] 「この文は本文に存在しません」`;

    expect(parseCitations(response, fullText, 2)).toStrictEqual([
      {
        id: "1",
        type: "pdf",
        text: "この文は本文に存在しません",
        pageMiss: "not-in-book",
      },
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

  it("gives a citation neither a page nor a reason when the book has no text to search", () => {
    const response = `本文[1]\n\n## Sources\n[1] 「引用」`;

    expect(parseCitations(response)).toStrictEqual([{ id: "1", type: "pdf", text: "引用" }]);
  });

  it("returns no citations when the answer has no Sources section", () => {
    expect(parseCitations("出典のない回答です", fullTextOf("本文"), 1)).toStrictEqual([]);
  });
});
