import { describe, it, expect, vi } from "vite-plus/test";
import { render, screen, fireEvent } from "@testing-library/react";
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
    // A drag ends on the message it ran over, and the list hears it from there
    drag: (passage: ChatQuoteSelection | null) => {
      selected = passage;
      fireEvent.mouseUp(screen.getByText(question.content));
    },
  };
}

describe("ChatMessageList", () => {
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

  it("offers to quote a passage once it has been dragged over", () => {
    const { drag } = renderList();

    drag(DRAGGED);

    expect(screen.getByRole("button", { name: "引用して質問" })).toBeVisible();
  });

  it("hands the dragged passage over and puts the offer away when it is taken up", async () => {
    const { drag, onQuote } = renderList();
    drag(DRAGGED);

    await userEvent.click(screen.getByRole("button", { name: "引用して質問" }));

    expect(onQuote.mock.calls).toEqual([["エッジはメモリを共有できません"]]);
    expect(screen.queryByRole("button", { name: "引用して質問" })).toBeNull();
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

    await userEvent.click(screen.getByRole("button", { name: "引用して質問" }));

    expect(window.getSelection()?.toString()).toBe("");
  });

  it("puts the offer away when the next drag selected nothing to quote", () => {
    // Otherwise the offer stays over a passage the reader has since deselected,
    // and quotes it
    const { drag } = renderList();
    drag(DRAGGED);
    expect(screen.getByRole("button", { name: "引用して質問" })).toBeVisible();

    drag(null);

    expect(screen.queryByRole("button", { name: "引用して質問" })).toBeNull();
  });
});
