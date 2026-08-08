import { describe, it, expect } from "vite-plus/test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider, createStore } from "jotai";
import { ChatArea } from "./ChatArea";
import { activeSelectionAtom } from "../../atoms/chatAtom";
import { pdfDocAtom } from "../../atoms/pdfAtom";

const SELECTED_TEXT = "エッジはサーバーレス実行基盤で、実行単位をまたいでメモリを共有できません。";

function renderChat() {
  const store = createStore();
  store.set(pdfDocAtom, { id: "p1", fileName: "Cloudflare Workers.pdf", pageCount: 209 });
  store.set(activeSelectionAtom, { id: "s1", selectedText: SELECTED_TEXT, pageNumber: 42 });

  render(
    <Provider store={store}>
      <ChatArea />
    </Provider>,
  );
  return store;
}

describe("ChatArea", () => {
  it("shows the selected passage the question is about", () => {
    renderChat();

    expect(screen.getByText(SELECTED_TEXT)).toBeInTheDocument();
  });

  it("returns to the empty state when the selected passage is dismissed", async () => {
    const store = renderChat();

    await userEvent.click(screen.getByRole("button", { name: "選択を解除" }));

    expect(store.get(activeSelectionAtom)).toBeNull();
    expect(screen.getByText("PDF内のテキストを選択して質問してください")).toBeInTheDocument();
  });
});
