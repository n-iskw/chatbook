import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ChatMessageBubble } from "./ChatMessageBubble";
import type { ChatMessage } from "../../atoms/chatAtom";

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
    render(<ChatMessageBubble message={message({ content: "Workers は **エッジ** で動きます" })} />);

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

  it("shows the user's own message verbatim instead of parsing markdown", () => {
    render(
      <ChatMessageBubble message={message({ role: "user", content: "**これは太字ではない**" })} />,
    );

    expect(screen.getByText("**これは太字ではない**")).toBeInTheDocument();
    expect(screen.queryByText("これは太字ではない")).toBeNull();
  });
});
