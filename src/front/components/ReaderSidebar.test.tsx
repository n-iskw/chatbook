import { describe, expect, it, vi } from "vite-plus/test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { ReaderSidebar, type ReaderOutlineState, type ReaderSidebarTab } from "./ReaderSidebar";
import { SwrTestCache } from "../../test/swrTestCache";
import { bookKey } from "../hooks/useBook";
import type { BookDetail, BookSummary } from "../../shared/schemas/book";
import type { SelectionHighlight } from "../../shared/schemas/selection";

const HIGHLIGHT: SelectionHighlight = {
  id: "selection-1",
  selectedText: "選択した本文",
  pageNumber: 12,
  positionData: { rects: [] },
  color: "#FFEB3B",
  createdAt: "2026-01-01T00:00:00Z",
};

const BOOK: BookDetail = {
  id: "book-1",
  fileName: "読書中の本.pdf",
  pageCount: 42,
  hasThumbnail: false,
  hasOutline: true,
  selections: [HIGHLIGHT],
  outline: [{ title: "第1章", pageNumber: 3, children: [] }],
  readingState: null,
};

const BOOKS: BookSummary[] = [
  {
    id: BOOK.id,
    fileName: BOOK.fileName,
    pageCount: BOOK.pageCount,
    updatedAt: "2026-01-01T00:00:00Z",
    hasThumbnail: false,
  },
  {
    id: "book-2",
    fileName: "別の本.pdf",
    pageCount: 18,
    updatedAt: "2026-01-02T00:00:00Z",
    hasThumbnail: false,
  },
];

const OUTLINE_STATE: ReaderOutlineState = {
  outline: [{ title: "第1章", pageNumber: 3, children: [] }],
  error: null,
  onGenerate: vi.fn(),
  generating: false,
  generationError: null,
};

function renderSidebar(activeTab: ReaderSidebarTab = "outline") {
  const onTabChange = vi.fn();
  const onOutlineJump = vi.fn();
  const onSelectionClick = vi.fn();

  render(
    <SwrTestCache seed={{ [bookKey(BOOK.id)]: BOOK }}>
      <MemoryRouter>
        <ReaderSidebar
          book={BOOK}
          currentPage={1}
          activeTab={activeTab}
          onTabChange={onTabChange}
          onOutlineJump={onOutlineJump}
          outlineState={OUTLINE_STATE}
          onSelectionClick={onSelectionClick}
          loadBooks={async () => BOOKS}
          loadBook={async () => BOOK}
        />
      </MemoryRouter>
    </SwrTestCache>,
  );

  return { onTabChange, onOutlineJump, onSelectionClick };
}

describe("ReaderSidebar", () => {
  it("switches between the shelf, outline, and highlight tabs", async () => {
    const user = userEvent.setup();
    const { onTabChange } = renderSidebar();

    expect(screen.getByRole("tab", { name: "本棚" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "第1章3" })).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "本棚" }));
    expect(onTabChange).toHaveBeenCalledWith("shelf");
  });

  it("shows books and the current book when the shelf tab is selected", async () => {
    const user = userEvent.setup();
    renderSidebar("shelf");

    expect(await screen.findByRole("button", { name: "読書中の本 を開く" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await user.click(screen.getByRole("button", { name: "別の本 を開く" }));
  });

  it("opens a highlight without changing the selected book or outline state", async () => {
    const user = userEvent.setup();
    const { onSelectionClick } = renderSidebar("highlights");

    expect(screen.getByText("ハイライト 1件")).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: /選択した本文/ })[0]);
    expect(onSelectionClick).toHaveBeenCalledWith({
      id: HIGHLIGHT.id,
      selectedText: HIGHLIGHT.selectedText,
      pageNumber: HIGHLIGHT.pageNumber,
    });
  });

  it("shows an empty shelf instead of leaving a blank tab", async () => {
    render(
      <SwrTestCache>
        <MemoryRouter>
          <ReaderSidebar
            book={undefined}
            currentPage={1}
            activeTab="shelf"
            onTabChange={vi.fn()}
            onOutlineJump={vi.fn()}
            outlineState={OUTLINE_STATE}
            onSelectionClick={vi.fn()}
            loadBooks={async () => []}
            loadBook={async () => BOOK}
          />
        </MemoryRouter>
      </SwrTestCache>,
    );

    expect(await screen.findByText("本棚は空です")).toBeInTheDocument();
  });
});
