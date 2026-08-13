import { describe, it, expect, beforeEach, afterEach } from "vite-plus/test";
import { readChatQuote } from "./chatQuoteSelection";

/**
 * jsdom lays nothing out and gives `Range` no way to be measured at all. The
 * action is placed against the box the browser reports, so the tests supply
 * one worth placing against.
 */
const MEASURED = { top: 120, left: 40, width: 200, height: 18 };

beforeEach(() => {
  Object.defineProperty(Range.prototype, "getBoundingClientRect", {
    configurable: true,
    value: () => MEASURED as DOMRect,
  });
});

afterEach(() => {
  delete (Range.prototype as Partial<Range>).getBoundingClientRect;
  document.body.innerHTML = "";
});

/** A conversation with one answer in it, plus a quote box outside the thread. */
function renderConversation() {
  document.body.innerHTML = `
    <div id="messages"><div id="answer">Durable Objects は状態を一箇所に集めます</div></div>
    <div id="elsewhere">別の場所のテキスト</div>
  `;
  return {
    messages: document.getElementById("messages")!,
    answer: document.getElementById("answer")!,
    elsewhere: document.getElementById("elsewhere")!,
  };
}

/** Selects everything inside `node`, as a drag across it would. */
function selectContentsOf(node: Node): Selection {
  const range = document.createRange();
  range.selectNodeContents(node);
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
  return selection;
}

describe("readChatQuote", () => {
  it("reads the dragged passage and where it sits when it is inside the conversation", () => {
    const { messages, answer } = renderConversation();

    const quote = readChatQuote(selectContentsOf(answer), messages);

    expect(quote).toStrictEqual({
      text: "Durable Objects は状態を一箇所に集めます",
      rect: { top: 120, left: 40, width: 200 },
    });
  });

  it("reads nothing when the passage was dragged outside the conversation", () => {
    // Otherwise the quote box under the input could quote itself
    const { messages, elsewhere } = renderConversation();

    expect(readChatQuote(selectContentsOf(elsewhere), messages)).toBeNull();
  });

  it("reads nothing from a click that selected no text", () => {
    const { messages, answer } = renderConversation();
    const selection = selectContentsOf(answer);
    selection.collapseToStart();

    expect(readChatQuote(selection, messages)).toBeNull();
  });

  it("reads nothing when only the whitespace between messages was dragged over", () => {
    document.body.innerHTML = `<div id="messages">   </div>`;
    const messages = document.getElementById("messages")!;

    expect(readChatQuote(selectContentsOf(messages), messages)).toBeNull();
  });

  it("reads nothing when the browser reports no selection at all", () => {
    const { messages } = renderConversation();

    expect(readChatQuote(null, messages)).toBeNull();
  });
});
