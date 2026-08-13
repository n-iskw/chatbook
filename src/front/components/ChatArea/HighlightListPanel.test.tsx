import { describe, it, expect } from "vite-plus/test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HighlightListPanel, type HighlightListItem } from "./HighlightListPanel";

const OLDER: HighlightListItem = {
  id: "01JOLD",
  selectedText: "エッジはサーバーレス実行基盤で、実行単位をまたいでメモリを共有できません。",
  pageNumber: 42,
  color: "#FFEB3B",
  createdAt: "2026-08-01T10:00:00.000Z",
};

const MIDDLE: HighlightListItem = {
  id: "01JMID",
  selectedText: "KV は結果整合で、書き込みが伝わるまで数秒かかります。",
  pageNumber: 88,
  color: "#4CAF50",
  createdAt: "2026-08-02T10:00:00.000Z",
};

const NEWER: HighlightListItem = {
  id: "01JNEW",
  selectedText: "Durable Objects は単一のインスタンスに処理を集約します。",
  pageNumber: 7,
  color: "#2196F3",
  createdAt: "2026-08-03T10:00:00.000Z",
};

describe("HighlightListPanel", () => {
  it("shows each highlight with its passage and page, plus how many there are", () => {
    render(<HighlightListPanel highlights={[OLDER, NEWER]} onSelect={() => {}} />);

    expect(screen.getByText("ハイライト 2件")).toBeInTheDocument();
    expect(screen.getByText(OLDER.selectedText)).toBeInTheDocument();
    expect(screen.getByText("42ページ")).toBeInTheDocument();
    expect(screen.getByText(NEWER.selectedText)).toBeInTheDocument();
    expect(screen.getByText("7ページ")).toBeInTheDocument();
  });

  it("lists the most recently created highlight first, whatever order they arrive in", () => {
    render(<HighlightListPanel highlights={[NEWER, OLDER, MIDDLE]} onSelect={() => {}} />);

    const passages = screen
      .getAllByRole("button")
      .map((button) => button.textContent?.replace(/\d+ページ$/, ""));

    expect(passages).toStrictEqual([NEWER.selectedText, MIDDLE.selectedText, OLDER.selectedText]);
  });

  it("hands the clicked highlight to onSelect so its chat can be opened", async () => {
    const selected: unknown[] = [];
    render(<HighlightListPanel highlights={[OLDER, NEWER]} onSelect={(h) => selected.push(h)} />);

    await userEvent.click(screen.getByText(OLDER.selectedText));

    expect(selected).toStrictEqual([
      { id: OLDER.id, selectedText: OLDER.selectedText, pageNumber: OLDER.pageNumber },
    ]);
  });

  it("tells the reader how to start when the book has no highlights yet", () => {
    render(<HighlightListPanel highlights={[]} onSelect={() => {}} />);

    expect(screen.getByText("チャットを開始するには")).toBeInTheDocument();
    expect(screen.getByText("PDF内のテキストを選択して質問してください")).toBeInTheDocument();
  });
});
