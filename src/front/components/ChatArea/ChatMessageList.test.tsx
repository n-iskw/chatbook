import { describe, it, expect, beforeEach, afterEach, vi } from "vite-plus/test";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatMessageList } from "./ChatMessageList";
import type { ChatMessage } from "../../../shared/schemas/chat";
import type { ChatQuoteSelection } from "../../lib/chatQuoteSelection";

const question: ChatMessage = {
  id: "m1",
  role: "user",
  content: "この段落を一言で要約して",
  createdAt: "2026-01-01T00:00:00.000Z",
};

const DRAGGED: ChatQuoteSelection = {
  text: "エッジはメモリを共有できません",
  rect: { top: 120, left: 40, width: 200 },
};

/**
 * The list with a stand-in for the drag.
 *
 * Reading the selection needs a real drag over laid-out text, and jsdom has
 * neither, so the read is the seam everything downstream is driven through.
 * The stand-in keeps what was last dragged over, like a browser holds a
 * selection until something replaces it.
 */
function renderList() {
  const onQuote = vi.fn();
  let selected: ChatQuoteSelection | null = null;
  const rendered = render(
    <ChatMessageList
      messages={[question]}
      streamingContent=""
      isStreaming={false}
      onQuote={onQuote}
      readQuote={() => selected}
    />,
  );
  return {
    ...rendered,
    onQuote,
    // However the passage was chosen, the list hears about it from the browser
    // announcing the selection
    drag: (passage: ChatQuoteSelection | null) => {
      selected = passage;
      document.dispatchEvent(new Event("selectionchange"));
    },
  };
}

describe("ChatMessageList", () => {
  // The document's selection outlives a test. jsdom's `addRange` is a no-op
  // while a range is already held, so a leftover would silently swallow the
  // arrange of whichever test sets one up next.
  beforeEach(() => {
    window.getSelection()?.removeAllRanges();
  });

  it("shows the question and a waiting indicator while no token has arrived yet", () => {
    render(
      <ChatMessageList
        messages={[question]}
        streamingContent=""
        isStreaming={true}
        onQuote={vi.fn()}
      />,
    );

    expect(screen.getByText("この段落を一言で要約して")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent(/^考え中…$/);
  });

  it("replaces the waiting indicator with the answer once tokens start arriving", () => {
    const { rerender } = render(
      <ChatMessageList
        messages={[question]}
        streamingContent=""
        isStreaming={true}
        onQuote={vi.fn()}
      />,
    );

    rerender(
      <ChatMessageList
        messages={[question]}
        streamingContent="要約すると"
        isStreaming={true}
        onQuote={vi.fn()}
      />,
    );

    expect(screen.getByText("要約すると")).toBeVisible();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows only the finished conversation when nothing is streaming", () => {
    const answer: ChatMessage = {
      id: "m2",
      role: "assistant",
      content: "要約すると、これはテキスト選択の話です。",
      createdAt: "2026-01-01T00:00:01.000Z",
    };

    render(
      <ChatMessageList
        messages={[question, answer]}
        streamingContent=""
        isStreaming={false}
        onQuote={vi.fn()}
      />,
    );

    expect(screen.getByText("この段落を一言で要約して")).toBeVisible();
    expect(screen.getByText("要約すると、これはテキスト選択の話です。")).toBeVisible();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("offers to quote a passage once it has been dragged over", async () => {
    const { drag } = renderList();

    drag(DRAGGED);

    expect(await screen.findByRole("button", { name: "引用して質問" })).toBeVisible();
  });

  it("hands the dragged passage over and puts the offer away when it is taken up", async () => {
    const { drag, onQuote } = renderList();
    drag(DRAGGED);

    await userEvent.click(await screen.findByRole("button", { name: "引用して質問" }));

    expect(onQuote.mock.calls).toStrictEqual([["エッジはメモリを共有できません"]]);
    await waitFor(() => expect(screen.queryByRole("button", { name: "引用して質問" })).toBeNull());
  });

  it("lets go of the passage once it has been quoted", async () => {
    // A passage left selected is one the browser offers to drag and drop, so
    // the next drag over it moves text instead of selecting it — and the
    // reader cannot quote the same passage a second time.
    const { drag } = renderList();
    const marked = document.createRange();
    marked.selectNodeContents(screen.getByText(question.content));
    window.getSelection()!.addRange(marked);
    drag(DRAGGED);

    await userEvent.click(await screen.findByRole("button", { name: "引用して質問" }));

    expect(window.getSelection()?.toString()).toBe("");
  });

  it("puts the offer away when the next drag selected nothing to quote", async () => {
    // Otherwise the offer stays over a passage the reader has since deselected,
    // and quotes it
    const { drag } = renderList();
    drag(DRAGGED);
    expect(await screen.findByRole("button", { name: "引用して質問" })).toBeVisible();

    drag(null);

    await waitFor(() => expect(screen.queryByRole("button", { name: "引用して質問" })).toBeNull());
  });

  // Driven through the real read, so what the list hands it — the thread
  // element, not the whole document — is under test. With the stand-in above,
  // the list could read the page's text layer and nothing would notice.
  describe("reading the browser's own selection", () => {
    let outsideTheThread: HTMLParagraphElement;

    beforeEach(() => {
      // jsdom lays nothing out and leaves `Range` unmeasurable
      Object.defineProperty(Range.prototype, "getBoundingClientRect", {
        configurable: true,
        value: () => ({ top: 0, left: 0, width: 0 }) as DOMRect,
      });
      outsideTheThread = document.createElement("p");
      outsideTheThread.textContent = "PDF 本文の一節";
      document.body.appendChild(outsideTheThread);
    });

    afterEach(() => {
      delete (Range.prototype as Partial<Range>).getBoundingClientRect;
      outsideTheThread.remove();
    });

    /** The list wired to the real read, plus somewhere outside it to select. */
    function renderWithLiveSelection() {
      render(
        <ChatMessageList
          messages={[question]}
          streamingContent=""
          isStreaming={false}
          onQuote={vi.fn()}
        />,
      );

      return {
        select: (node: Node) => {
          const range = document.createRange();
          range.selectNodeContents(node);
          window.getSelection()!.addRange(range);
        },
        // The browser announces the selection either way; what differs is
        // where the text they had selected lives
        releaseOverThread: () => document.dispatchEvent(new Event("selectionchange")),
      };
    }

    it("offers to quote a passage selected in the thread", async () => {
      const { select, releaseOverThread } = renderWithLiveSelection();

      select(screen.getByText(question.content));
      releaseOverThread();

      expect(await screen.findByRole("button", { name: "引用して質問" })).toBeVisible();
    });

    it("ignores a passage still selected on the page outside the thread", async () => {
      // The reader drags over the PDF, then clicks in the chat panel: the
      // page's text is still selected, and it is not part of this conversation
      const { select, releaseOverThread } = renderWithLiveSelection();

      select(outsideTheThread);
      releaseOverThread();

      await waitFor(() =>
        expect(screen.queryByRole("button", { name: "引用して質問" })).toBeNull(),
      );
    });
  });
});
