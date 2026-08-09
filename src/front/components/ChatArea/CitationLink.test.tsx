import { describe, it, expect } from "vite-plus/test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider, createStore } from "jotai";
import { CitationLink } from "./CitationLink";
import { citedPassageAtom, currentPageAtom } from "../../atoms/pdfAtom";
import type { Citation } from "../../../shared/schemas/citation";

function renderLink(citation: Citation) {
  const store = createStore();
  render(
    <Provider store={store}>
      <CitationLink citation={citation} />
    </Provider>,
  );
  return store;
}

describe("CitationLink", () => {
  it("moves the viewer to the cited page and marks the quoted passage on it", async () => {
    const store = renderLink({
      id: "1",
      type: "pdf",
      text: "エッジはサーバーレス実行基盤です",
      pageNumber: 42,
    });

    await userEvent.click(screen.getByRole("button", { name: "出典 [1] のページへ移動" }));

    expect(store.get(currentPageAtom)).toBe(42);
    // The page alone would leave the reader hunting for the quoted lines
    expect(store.get(citedPassageAtom)).toEqual({
      pageNumber: 42,
      text: "エッジはサーバーレス実行基盤です",
    });
  });

  it("opens a web source in a new tab instead of moving the viewer", async () => {
    const store = renderLink({
      id: "3",
      type: "web",
      text: "Cloudflare Docs",
      url: "https://developers.cloudflare.com/workers/",
    });

    const link = screen.getByRole("link");
    // Following it must leave the book where it is: the source is not in it
    await userEvent.click(link);

    expect([
      link.textContent,
      link.getAttribute("href"),
      link.getAttribute("target"),
      link.getAttribute("rel"),
    ]).toEqual([
      "[3]",
      "https://developers.cloudflare.com/workers/",
      "_blank",
      "noopener noreferrer",
    ]);
    expect(store.get(currentPageAtom)).toBe(1);
    expect(store.get(citedPassageAtom)).toBeNull();
  });

  it("offers no jump for a pdf source whose page could not be resolved", () => {
    renderLink({ id: "2", type: "pdf", text: "どのページか特定できない引用" });

    expect(screen.getByText("[2]").tagName).toBe("SPAN");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("says a quote the book does not hold may not be its words, not just that it has no page", () => {
    renderLink({
      id: "2",
      type: "pdf",
      text: "本文に無い引用",
      pageMiss: "not-in-book",
    });

    expect(screen.getByText("[2]")).toHaveAttribute(
      "title",
      "本文に一致する箇所が見つかりませんでした（引用が本文どおりでない可能性があります）: 本文に無い引用",
    );
  });

  it("says a source with no quotable text is missing one rather than missing a page", () => {
    renderLink({
      id: "4",
      type: "pdf",
      text: "「」",
      pageMiss: "no-quote",
    });

    expect(screen.getByText("[4]")).toHaveAttribute("title", "出典に引用文が入っていません: 「」");
  });

  it("says a book of one page has nowhere to jump to instead of blaming the quote", () => {
    renderLink({
      id: "3",
      type: "pdf",
      text: "1ページの本からの引用",
      pageMiss: "single-page-book",
    });

    expect(screen.getByText("[3]")).toHaveAttribute(
      "title",
      "この本は1ページなので移動先がありません: 1ページの本からの引用",
    );
  });
});
