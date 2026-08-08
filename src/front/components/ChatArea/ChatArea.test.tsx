import { describe, it, expect } from "vite-plus/test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider, createStore } from "jotai";
import { ChatArea } from "./ChatArea";
import {
  activeSelectionAtom,
  selectionsAtom,
  type ActiveSelection,
  type SelectionHighlight,
} from "../../atoms/chatAtom";
import { pdfDocAtom } from "../../atoms/pdfAtom";

const SELECTED_TEXT = "エッジはサーバーレス実行基盤で、実行単位をまたいでメモリを共有できません。";
const OTHER_TEXT = "Durable Objects は単一のインスタンスに処理を集約します。";

const HIGHLIGHTS: SelectionHighlight[] = [
  {
    id: "s1",
    selectedText: SELECTED_TEXT,
    pageNumber: 42,
    positionData: { rects: [] },
    color: "#FFEB3B",
    createdAt: "2026-08-01T10:00:00.000Z",
  },
  {
    id: "s2",
    selectedText: OTHER_TEXT,
    pageNumber: 7,
    positionData: { rects: [] },
    color: "#2196F3",
    createdAt: "2026-08-02T10:00:00.000Z",
  },
];

function renderChat(options: { activeSelection?: ActiveSelection | null } = {}) {
  const { activeSelection = { id: "s1", selectedText: SELECTED_TEXT, pageNumber: 42 } } = options;
  const store = createStore();
  store.set(pdfDocAtom, { id: "p1", fileName: "Cloudflare Workers.pdf", pageCount: 209 });
  store.set(activeSelectionAtom, activeSelection);
  store.set(selectionsAtom, HIGHLIGHTS);

  const opened: ActiveSelection[] = [];
  render(
    <Provider store={store}>
      <ChatArea onSelectionClick={(selection) => opened.push(selection)} />
    </Provider>,
  );
  return { store, opened };
}

describe("ChatArea", () => {
  it("shows the selected passage the question is about", () => {
    renderChat();

    expect(screen.getByText(SELECTED_TEXT)).toBeInTheDocument();
  });

  it("lists the book's highlights while no passage is selected", () => {
    renderChat({ activeSelection: null });

    expect(screen.getByText("ハイライト 2件")).toBeInTheDocument();
    expect(screen.getByText(OTHER_TEXT)).toBeInTheDocument();
  });

  it("hands the highlight picked from the list to onSelectionClick", async () => {
    const { opened } = renderChat({ activeSelection: null });

    await userEvent.click(screen.getByText(OTHER_TEXT));

    expect(opened).toEqual([{ id: "s2", selectedText: OTHER_TEXT, pageNumber: 7 }]);
  });

  it("returns to the highlight list when the chat is left", async () => {
    const { store } = renderChat();

    await userEvent.click(screen.getByRole("button", { name: "一覧に戻る" }));

    expect(store.get(activeSelectionAtom)).toBeNull();
    expect(screen.getByText("ハイライト 2件")).toBeInTheDocument();
  });
});
