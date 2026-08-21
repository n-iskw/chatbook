import { describe, it, expect, beforeEach, vi } from "vite-plus/test";
import { render, screen, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SelectionPopover } from "./SelectionPopover";

const PASSAGE = "行間を読むという言い方がある";

function renderPopover(quote = PASSAGE) {
  const onSubmit = vi.fn();
  const onDismiss = vi.fn();
  const { unmount } = render(
    <SelectionPopover quote={quote} onSubmit={onSubmit} onDismiss={onDismiss} />,
  );
  return {
    onSubmit,
    onDismiss,
    unmount,
    input: screen.getByPlaceholderText("選択した文章について質問する..."),
  };
}

/**
 * The copy the browser would raise. jsdom has no ClipboardEvent to build one
 * with, so the clipboard is hung off a plain event.
 */
function dispatchCopy(target: EventTarget, setData = vi.fn()) {
  const event = new Event("copy", { cancelable: true, bubbles: true });
  Object.defineProperty(event, "clipboardData", { value: { setData } });
  target.dispatchEvent(event);
  return { setData, event };
}

describe("SelectionPopover", () => {
  // The document's selection outlives a test, and so does anything appended to
  // the body. A leftover range would meet the copy handler's own guard and stop
  // it intervening in whichever test runs next.
  beforeEach(() => {
    window.getSelection()?.removeAllRanges();
  });

  it("sends the typed question when Enter is pressed", async () => {
    const { onSubmit, input } = renderPopover();
    await userEvent.type(input, "この段落を一言で要約して");

    fireEvent.keyDown(input, { key: "Enter" });

    expect(onSubmit.mock.calls).toStrictEqual([["この段落を一言で要約して"]]);
  });

  it("sends the typed question when the ask button is clicked", async () => {
    const { onSubmit, input } = renderPopover();
    await userEvent.type(input, "この段落を一言で要約して");

    await userEvent.click(screen.getByRole("button", { name: "質問する" }));

    expect(onSubmit.mock.calls).toStrictEqual([["この段落を一言で要約して"]]);
  });

  it("asks once while the first ask is still in flight", async () => {
    // The popover now stays open until the highlight is stored, so a second
    // submit during that window used to create a second highlight and a second
    // answer that killed the first one's stream.
    let finishAsking!: () => void;
    const onSubmit = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishAsking = resolve;
        }),
    );
    render(<SelectionPopover quote={PASSAGE} onSubmit={onSubmit} onDismiss={vi.fn()} />);
    const input = screen.getByPlaceholderText("選択した文章について質問する...");
    await userEvent.type(input, "この段落を一言で要約して");

    await userEvent.click(screen.getByRole("button", { name: "質問する" }));

    // The reader can see the ask is under way, and neither the button nor
    // Enter starts a second one
    const asking = screen.getByRole("button", { name: "送信中..." });
    expect(asking).toBeDisabled();
    await userEvent.click(asking);
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onSubmit.mock.calls).toStrictEqual([["この段落を一言で要約して"]]);

    await act(async () => {
      finishAsking();
    });
  });

  it("lets the reader ask again once a failed ask has finished", async () => {
    // The popover is kept open on failure precisely so the question can be
    // sent again; it must not stay stuck in its sending state.
    let failAsking!: () => void;
    const onSubmit = vi.fn(
      () =>
        new Promise<void>((_, reject) => {
          failAsking = () => reject(new Error("Server exploded"));
        }),
    );
    render(<SelectionPopover quote={PASSAGE} onSubmit={onSubmit} onDismiss={vi.fn()} />);
    const input = screen.getByPlaceholderText("選択した文章について質問する...");
    await userEvent.type(input, "この段落を一言で要約して");

    await userEvent.click(screen.getByRole("button", { name: "質問する" }));
    await act(async () => {
      failAsking();
    });

    await userEvent.click(await screen.findByRole("button", { name: "質問する" }));

    expect(onSubmit.mock.calls).toStrictEqual([
      ["この段落を一言で要約して"],
      ["この段落を一言で要約して"],
    ]);
  });

  it("keeps the question unsent when Enter only confirms an IME conversion", async () => {
    const { onSubmit, input } = renderPopover();
    await userEvent.type(input, "これはなに");

    fireEvent.keyDown(input, { key: "Enter", isComposing: true });

    expect(input).toHaveValue("これはなに");
    expect(onSubmit.mock.calls).toStrictEqual([]);
  });
  it("puts the passage on the clipboard when the reader copies with the box open", () => {
    // Opening the box focuses its field, and that collapses the browser's own
    // selection — so a plain Cmd+C would otherwise copy nothing at all, while
    // the passage still looks selected (the overlay keeps drawing it).
    const { input } = renderPopover();

    const { setData, event } = dispatchCopy(input);

    expect(setData.mock.calls).toStrictEqual([["text/plain", PASSAGE]]);
    expect(event.defaultPrevented).toBe(true);
  });

  it("leaves the copy alone when the reader is copying what they typed", async () => {
    const { input } = renderPopover();
    await userEvent.type(input, "要約して");
    (input as HTMLTextAreaElement).setSelectionRange(0, 3);

    const { setData, event } = dispatchCopy(input);

    expect(setData.mock.calls).toStrictEqual([]);
    expect(event.defaultPrevented).toBe(false);

    // Nothing but the guard held it back: with the field's own selection gone,
    // the same copy is answered again.
    (input as HTMLTextAreaElement).setSelectionRange(0, 0);
    expect(dispatchCopy(input).setData.mock.calls).toStrictEqual([["text/plain", PASSAGE]]);
  });

  it("leaves the copy alone when a selection elsewhere is still standing", () => {
    // A passage the reader took in the chat panel is a live selection the
    // browser can copy on its own; the box has no business overwriting it.
    renderPopover();
    const elsewhere = document.createElement("p");
    elsewhere.textContent = "回答として返ってきた一文";
    document.body.append(elsewhere);
    window.getSelection()?.selectAllChildren(elsewhere);

    const { setData, event } = dispatchCopy(elsewhere);

    expect(window.getSelection()?.toString()).toBe("回答として返ってきた一文");
    expect(setData.mock.calls).toStrictEqual([]);
    expect(event.defaultPrevented).toBe(false);

    // Nothing but the guard held it back: once that selection is gone, the
    // same copy is answered again.
    window.getSelection()?.removeAllRanges();
    expect(dispatchCopy(elsewhere).setData.mock.calls).toStrictEqual([["text/plain", PASSAGE]]);
    elsewhere.remove();
  });

  it("stops answering copies once it has closed", () => {
    const { unmount } = renderPopover();
    const setData = vi.fn();

    dispatchCopy(document.body, setData);
    expect(setData.mock.calls).toStrictEqual([["text/plain", PASSAGE]]);

    unmount();
    dispatchCopy(document.body, setData);

    expect(setData.mock.calls).toStrictEqual([["text/plain", PASSAGE]]);
  });

  it("stays open when the reader right-clicks outside it", async () => {
    // The context menu is how a passage gets copied without the keyboard;
    // dismissing on it takes the selection away before the menu is even up.
    const { onDismiss } = renderPopover();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    fireEvent.mouseDown(document.body, { button: 2 });
    expect(onDismiss.mock.calls).toStrictEqual([]);

    fireEvent.mouseDown(document.body, { button: 0 });
    expect(onDismiss.mock.calls).toStrictEqual([[]]);
  });
});
