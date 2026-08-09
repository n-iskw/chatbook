import { describe, it, expect } from "vite-plus/test";
import { render, screen } from "@testing-library/react";
import { unstable_serialize } from "swr";
import { ChatMessageBubble } from "./ChatMessageBubble";
import { SwrTestCache } from "../../../test/swrTestCache";
import type { ChatMessage } from "../../../shared/schemas/chat";

function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "m1",
    role: "assistant",
    content: "",
    createdAt: "2026-08-08T00:00:00Z",
    ...overrides,
  };
}

describe("ChatMessageBubble", () => {
  it("renders emphasis in an assistant answer as markdown", () => {
    render(
      <ChatMessageBubble message={message({ content: "Workers は **エッジ** で動きます" })} />,
    );

    const strong = screen.getByText("エッジ");
    expect(strong.tagName).toBe("STRONG");
  });

  it("renders a markdown list as list items", () => {
    render(<ChatMessageBubble message={message({ content: "- 高速\n- 低コスト" })} />);

    expect(screen.getByText("高速").closest("li")).not.toBeNull();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("renders fenced code as a code block", () => {
    render(<ChatMessageBubble message={message({ content: "```\nexport default app\n```" })} />);

    const code = screen.getByText("export default app");
    expect(code.closest("pre")).not.toBeNull();
  });

  // A fence that names no language gets no class from rehype-highlight, so the
  // `code` component cannot tell it from inline code and dresses it as a chip.
  // The chip's pale background lands inside the dark <pre> and swallows the text.
  it("keeps the inline code chip off a fenced block that names no language", () => {
    render(<ChatMessageBubble message={message({ content: "```\nexport default app\n```" })} />);

    const pre = screen.getByText("export default app").closest("pre");
    expect(pre?.className).toBe(
      "mb-2 overflow-x-auto rounded bg-gray-800 p-2 font-mono text-xs text-gray-100 last:mb-0 [&_code:not(.hljs)]:block [&_code:not(.hljs)]:bg-transparent [&_code:not(.hljs)]:p-0",
    );
  });

  it("colors keywords in a fenced code block that names its language", () => {
    const { container } = render(
      <ChatMessageBubble message={message({ content: "```js\nconst app = 1\n```" })} />,
    );

    const code = container.querySelector("pre code");
    expect(code?.className).toBe("block hljs language-js");
    expect(screen.getByText("const").className).toBe("hljs-keyword");
  });

  // The answer streams in token by token, so a fence is rendered many times
  // while its language is still half-typed and names nothing that exists
  it("renders a code block whose language is still being streamed as plain text", () => {
    const { container } = render(
      <ChatMessageBubble message={message({ content: "```typescr\ngraph TD" })} />,
    );

    // innerHTML, because highlighting would break the code into <span>s while
    // leaving textContent identical
    const code = container.querySelector("pre code");
    expect(code?.innerHTML).toBe("graph TD\n");
  });

  it("draws a mermaid fence as a diagram", () => {
    const svg = '<svg aria-label="diagram"><text>Start</text></svg>';
    const { container } = render(
      // The drawn diagram stands in for mermaid itself, which needs the SVG
      // layout a browser has and jsdom does not
      <SwrTestCache seed={{ [unstable_serialize(["mermaid", "graph TD\n"])]: svg }}>
        <ChatMessageBubble message={message({ content: "```mermaid\ngraph TD\n```" })} />
      </SwrTestCache>,
    );

    expect(container.querySelector("svg")?.outerHTML).toBe(svg);
    expect(container.querySelector("pre")).toBeNull();
  });

  it("shows a mermaid fence as code until its diagram has been drawn", () => {
    const { container } = render(
      // No seed, so the diagram is still on its way
      <SwrTestCache>
        <ChatMessageBubble message={message({ content: "```mermaid\ngraph TD\n```" })} />
      </SwrTestCache>,
    );

    const code = container.querySelector("pre code");
    expect(code?.innerHTML).toBe("graph TD\n");
  });

  it("turns a [1] in the answer body into the control that jumps to its page", () => {
    const content = `Workers はエッジで動きます[1]。\n\n## Sources\n[1] 「エッジで動きます」（本書 第1章）`;
    render(
      <ChatMessageBubble
        message={message({
          content,
          citations: [{ id: "1", type: "pdf", text: "エッジで動きます", pageNumber: 3 }],
        })}
      />,
    );

    const link = screen.getByRole("button", { name: "出典 [1] のページへ移動" });
    expect(link.textContent).toBe("[1]");
  });

  it("shows the answer without the Sources section, which the body's links replace", () => {
    const content = `Workers はエッジで動きます[1]。\n\n## Sources\n[1] 「エッジで動きます」（本書 第1章）`;
    render(
      <ChatMessageBubble
        message={message({
          content,
          citations: [{ id: "1", type: "pdf", text: "エッジで動きます", pageNumber: 3 }],
        })}
      />,
    );

    // The passage itself was in the stripped section, and "Sources:" was the
    // heading of the badge row that stood underneath the answer
    expect(screen.queryByText(/本書 第1章/)).toBeNull();
    expect(screen.queryByText("Sources:")).toBeNull();
  });

  it("leaves a [2] with no citation of its own as plain text", () => {
    const { container } = render(
      <ChatMessageBubble
        message={message({
          content: "根拠は[1]と[2]です。",
          citations: [{ id: "1", type: "pdf", text: "エッジで動きます", pageNumber: 3 }],
        })}
      />,
    );

    // [1] is the only control; the sentence still reads with both markers in it
    const links = screen.getAllByRole("button");
    expect(links.map((el) => el.getAttribute("aria-label"))).toEqual(["出典 [1] のページへ移動"]);
    expect(container.querySelector("p")?.textContent).toBe("根拠は[1]と[2]です。");
  });

  // The answer streams in before its citations do, so every `[n]` in it is a
  // reference to something the panel does not have yet
  it("leaves a [1] in an answer that carries no citations as plain text", () => {
    render(<ChatMessageBubble message={message({ content: "根拠は[1]です。" })} />);

    expect(screen.getByText("根拠は[1]です。")).toBeInTheDocument();
  });

  it("shows the user's own message verbatim instead of parsing markdown", () => {
    render(
      <ChatMessageBubble message={message({ role: "user", content: "**これは太字ではない**" })} />,
    );

    expect(screen.getByText("**これは太字ではない**")).toBeInTheDocument();
    expect(screen.queryByText("これは太字ではない")).toBeNull();
  });
});
