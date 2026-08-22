import useSWR from "swr";
import { useHighlights, type DeleteHighlight } from "../hooks/useHighlights";
import type { LoadBook } from "../hooks/useBook";
import { useHighlightSearch, type SearchSelections } from "../hooks/useHighlightSearch";
import { fetcher } from "../lib/fetcher";
import {
  bookListSchema,
  type BookDetail,
  type BookSummary,
  type OutlineEntry,
} from "../../shared/schemas/book";
import { useNavigate } from "react-router";
import { useSetAtom } from "jotai";
import { selectionDeletedAtom, type ActiveSelection } from "../atoms/chatAtom";
import { PdfOutline } from "./PdfViewer/PdfOutline";
import { HighlightListPanel } from "./ChatArea/HighlightListPanel";

const SHELF_KEY = "/api/pdfs";
const HIGHLIGHT_COLORS = [
  "#FFEB3B",
  "#FF9800",
  "#4CAF50",
  "#2196F3",
  "#9C27B0",
  "#F44336",
  "#00BCD4",
  "#FF5722",
];

export type ReaderSidebarTab = "shelf" | "outline" | "highlights";

export interface ReaderOutlineState {
  outline: OutlineEntry[] | null;
  error: string | null;
  onGenerate: () => void;
  generating: boolean;
  generationError: string | null;
}

interface ReaderSidebarProps {
  book: BookDetail | undefined;
  currentPage: number;
  activeTab: ReaderSidebarTab;
  onTabChange: (tab: ReaderSidebarTab) => void;
  onClose?: () => void;
  onOutlineJump: (pageNumber: number) => void;
  outlineState: ReaderOutlineState;
  onSelectionClick: (selection: ActiveSelection) => void;
  loadBooks?: () => Promise<BookSummary[]>;
  loadBook?: LoadBook;
  deleteHighlight?: DeleteHighlight;
  searchHighlights?: SearchSelections;
}

const fetchBooks = () => fetcher(SHELF_KEY, bookListSchema).then((data) => data.books);

function titleOf(fileName: string): string {
  return fileName.replace(/\.pdf$/i, "");
}

function ShelfPanel({
  books,
  error,
  currentBookId,
  onOpen,
}: {
  books: Array<Pick<BookSummary, "id" | "fileName" | "pageCount">> | undefined;
  error: Error | undefined;
  currentBookId: string | undefined;
  onOpen: (pdfId: string) => void;
}) {
  if (error) {
    return (
      <p role="alert" className="m-3 rounded-md bg-red-50 p-3 text-sm text-red-600">
        本棚を読み込めませんでした: {error.message}
      </p>
    );
  }

  if (!books) return <p className="p-3 text-sm text-gray-400">本棚を読み込み中...</p>;

  if (books.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-gray-500">
        <p className="font-medium text-gray-700">本棚は空です</p>
        <p className="mt-1">本棚画面からPDFを追加してください。</p>
      </div>
    );
  }

  return (
    <ul className="flex-1 overflow-y-auto py-1">
      {books.map((book) => {
        const title = titleOf(book.fileName);
        const current = book.id === currentBookId;
        return (
          <li key={book.id}>
            <button
              type="button"
              aria-current={current ? "page" : undefined}
              aria-label={`${title} を開く`}
              onClick={() => onOpen(book.id)}
              className={`flex w-full items-start gap-3 border-b border-gray-100 px-3 py-3 text-left hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 ${
                current ? "bg-blue-50" : ""
              }`}
            >
              <span
                aria-hidden="true"
                className="mt-0.5 flex h-8 w-6 shrink-0 items-center justify-center rounded-sm bg-gray-200 text-[10px] text-gray-500"
              >
                PDF
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-gray-700">{title}</span>
                <span className="mt-1 block text-xs text-gray-400">{book.pageCount}ページ</span>
              </span>
              {current && <span className="mt-1 text-xs text-blue-600">読書中</span>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function tabLabel(tab: ReaderSidebarTab): string {
  switch (tab) {
    case "shelf":
      return "本棚";
    case "outline":
      return "目次";
    case "highlights":
      return "ハイライト";
  }
}

/** The navigation column shared by the desktop pane and the narrow-screen sheet. */
export function ReaderSidebar({
  book,
  currentPage,
  activeTab,
  onTabChange,
  onClose,
  onOutlineJump,
  outlineState,
  onSelectionClick,
  loadBooks = fetchBooks,
  loadBook,
  deleteHighlight,
  searchHighlights,
}: ReaderSidebarProps) {
  const navigate = useNavigate();
  const selectionDeleted = useSetAtom(selectionDeletedAtom);
  const { data: books, error } = useSWR(SHELF_KEY, loadBooks, { revalidateOnMount: true });
  const { removeHighlight } = useHighlights(book?.id, loadBook, deleteHighlight);
  const highlights =
    book?.selections.map((selection, index) => ({
      ...selection,
      color: selection.color || HIGHLIGHT_COLORS[index % HIGHLIGHT_COLORS.length],
    })) ?? [];
  const { query, setQuery, submit, matchedIds, searchError } = useHighlightSearch(
    book?.id,
    searchHighlights,
  );

  // The upload response seeds the current book cache before navigation, while
  // the shelf list may still be revalidating. Keep the book being read visible
  // in that short interval instead of presenting an empty shelf.
  const currentBookEntry = book
    ? { id: book.id, fileName: book.fileName, pageCount: book.pageCount }
    : undefined;
  const shelfBooks =
    books && currentBookEntry && !books.some((shelfBook) => shelfBook.id === currentBookEntry.id)
      ? [currentBookEntry, ...books]
      : books;

  const openBook = (pdfId: string) => {
    if (pdfId !== book?.id) void navigate(`/books/${pdfId}`);
  };

  const tabId = `reader-sidebar-${activeTab}`;

  return (
    <aside
      aria-label="読書ナビゲーション"
      className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden border-r border-gray-200 bg-white"
    >
      <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-3 py-2">
        <h2 className="text-sm font-semibold text-gray-700">読書ナビ</h2>
        {onClose && (
          <button
            type="button"
            aria-label="読書ナビを閉じる"
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-lg text-gray-500 hover:bg-gray-50 hover:text-gray-700"
          >
            <span aria-hidden="true">×</span>
          </button>
        )}
      </div>

      <div
        role="tablist"
        aria-label="読書ナビの表示"
        className="grid shrink-0 grid-cols-3 border-b border-gray-200"
      >
        {(["shelf", "outline", "highlights"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            id={`reader-sidebar-tab-${tab}`}
            aria-selected={activeTab === tab}
            aria-controls={`reader-sidebar-panel-${tab}`}
            onClick={() => onTabChange(tab)}
            className={`min-h-11 px-1 text-xs font-medium focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 ${
              activeTab === tab
                ? "border-b-2 border-blue-600 text-blue-700"
                : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
            }`}
          >
            {tabLabel(tab)}
          </button>
        ))}
      </div>

      <div
        id={tabId.replace("reader-sidebar-", "reader-sidebar-panel-")}
        role="tabpanel"
        aria-labelledby={`reader-sidebar-tab-${activeTab}`}
        className="min-h-0 flex-1"
      >
        {activeTab === "shelf" && (
          <ShelfPanel books={shelfBooks} error={error} currentBookId={book?.id} onOpen={openBook} />
        )}

        {activeTab === "outline" && (
          <PdfOutline
            outline={outlineState.outline}
            error={outlineState.error}
            currentPage={currentPage}
            onJump={onOutlineJump}
            onGenerate={outlineState.onGenerate}
            generating={outlineState.generating}
            generationError={outlineState.generationError}
            className="h-full w-full border-0"
          />
        )}

        {activeTab === "highlights" && book && (
          <HighlightListPanel
            highlights={
              matchedIds
                ? highlights.filter((highlight) => matchedIds.has(highlight.id))
                : highlights
            }
            total={highlights.length}
            query={query}
            onQueryChange={setQuery}
            onSearch={submit}
            searched={matchedIds !== null}
            searchError={searchError}
            onSelect={onSelectionClick}
            onDelete={(selectionId) =>
              removeHighlight(book.id, selectionId).map(() => selectionDeleted(selectionId))
            }
          />
        )}

        {activeTab === "highlights" && !book && (
          <p className="p-3 text-sm text-gray-400">本を読み込み中...</p>
        )}
      </div>
    </aside>
  );
}
