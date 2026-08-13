import { describe, it, expect } from "vite-plus/test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider, createStore } from "jotai";
import { CitationLink } from "./CitationLink";
import { citedPassageAtom, currentPageAtom } from "../../atoms/pdfAtom";
import type { Citation } from "../../../shared/schemas/citation";
import type { PageMiss } from "../../../shared/schemas/book";

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
    expect(store.get(citedPassageAtom)).toStrictEqual({
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
    ]).toStrictEqual([
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

  // Three reasons a citation has no page, and each is a different thing to
  // tell the reader: a quote the book does not hold is the one clue that the
  // model reworded it, a source with no quote at all is missing one, and a book
  // of a single page simply has nowhere to jump to. Told apart here because a
  // badge that only said "no page" would blame the quote for all three.
  it.each([
    [
      "not-in-book",
      "the book may not hold the words the model quoted",
      "本文に無い引用",
      "本文に一致する箇所が見つかりませんでした（引用が本文どおりでない可能性があります）: 本文に無い引用",
    ],
    [
      "no-quote",
      "the source carries no quote to look for",
      "「」",
      "出典に引用文が入っていません: 「」",
    ],
    [
      "single-page-book",
      "a book of one page has nowhere to jump to",
      "1ページの本からの引用",
      "この本は1ページなので移動先がありません: 1ページの本からの引用",
    ],
  ] as [PageMiss, string, string, string][])(
    "says of a %s citation that %s, rather than only that it has no page",
    (pageMiss, _why, text, title) => {
      renderLink({ id: "2", type: "pdf", text, pageMiss });

      expect(screen.getByText("[2]")).toHaveAttribute("title", title);
    },
  );
});
