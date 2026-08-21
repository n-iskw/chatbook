import { describe, it, expect, vi } from "vite-plus/test";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatInput } from "./ChatInput";

function renderInput() {
  const onSend = vi.fn();
  render(<ChatInput onSend={onSend} quotedText="テキスト選択の仕組み" />);
  return { onSend, input: screen.getByPlaceholderText("質問を入力...") };
}

describe("ChatInput", () => {
  it("sends the typed question when Enter is pressed", async () => {
    const { onSend, input } = renderInput();
    await userEvent.type(input, "もう少し詳しく");

    fireEvent.keyDown(input, { key: "Enter" });

    expect(onSend.mock.calls).toStrictEqual([["もう少し詳しく"]]);
    expect(input).toHaveValue("");
  });

  it("sends the typed question when the send button is clicked", async () => {
    const { onSend, input } = renderInput();
    await userEvent.type(input, "もう少し詳しく");

    await userEvent.click(screen.getByRole("button", { name: "送信" }));

    expect(onSend.mock.calls).toStrictEqual([["もう少し詳しく"]]);
    expect(input).toHaveValue("");
  });

  it("keeps the question unsent when Enter only confirms an IME conversion", async () => {
    const { onSend, input } = renderInput();
    await userEvent.type(input, "これはなに");

    fireEvent.keyDown(input, { key: "Enter", isComposing: true });

    expect(input).toHaveValue("これはなに");
    expect(onSend.mock.calls).toStrictEqual([]);
  });

  it("trims the spaces around a question rather than sending them to the model", async () => {
    const { onSend, input } = renderInput();
    await userEvent.type(input, "  もう少し詳しく  ");

    await userEvent.click(screen.getByRole("button", { name: "送信" }));

    expect(onSend.mock.calls).toStrictEqual([["もう少し詳しく"]]);
  });

  it("offers no way to send a question made only of spaces", async () => {
    // Whitespace is not a question, and a chapter of the book rides in front
    // of every one of them: sending it would cost a full context for nothing.
    const { onSend, input } = renderInput();
    await userEvent.type(input, "   ");

    expect(screen.getByRole("button", { name: "送信" })).toBeDisabled();

    fireEvent.keyDown(input, { key: "Enter" });

    expect(onSend.mock.calls).toStrictEqual([]);
    expect(input).toHaveValue("   ");
  });

  it("says nothing can be sent while an answer is still coming", () => {
    // The stream writes into the same thread, and a second question would race
    // the first one's answer into it. Stated as the two controls being shut
    // rather than as a keypress doing nothing: a disabled textarea is not
    // something a browser delivers keys to, so pressing Enter at one here would
    // prove nothing it is not already proving.
    render(<ChatInput onSend={vi.fn()} quotedText="テキスト選択の仕組み" disabled />);

    expect(screen.getByPlaceholderText("質問を入力...")).toBeDisabled();
    expect(screen.getByRole("button", { name: "送信" })).toBeDisabled();
  });

  it("takes back a quote that can be taken back", async () => {
    const onClearQuote = vi.fn();
    render(
      <ChatInput onSend={vi.fn()} quotedText="引用した回答の一節" onClearQuote={onClearQuote} />,
    );

    await userEvent.click(screen.getByRole("button", { name: "引用を取り消す" }));

    expect(onClearQuote.mock.calls).toStrictEqual([[]]);
  });

  it("shows the passage the thread is about without offering to take it back", () => {
    // The highlight is what the conversation hangs off; dropping it would leave
    // the questions attached to nothing
    renderInput();

    expect(screen.getByText("テキスト選択の仕組み")).toBeVisible();
    expect(screen.queryByRole("button", { name: "引用を取り消す" })).toBeNull();
  });
});
