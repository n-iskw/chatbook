import type { ActiveSelection } from "../../atoms/chatAtom";

export interface HighlightListItem {
  id: string;
  selectedText: string;
  pageNumber: number;
  color: string;
  createdAt: string;
}

interface HighlightListPanelProps {
  highlights: HighlightListItem[];
  onSelect: (selection: ActiveSelection) => void;
}

/** Newest first, so the passage the reader just marked is at the top. */
function newestFirst(highlights: HighlightListItem[]): HighlightListItem[] {
  return highlights.toSorted((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function HighlightListPanel({ highlights, onSelect }: HighlightListPanelProps) {
  if (highlights.length === 0) {
    return (
      <div className="flex items-center justify-center h-full bg-white">
        <div className="text-center">
          <p className="text-gray-500 text-sm font-medium mb-1">チャットを開始するには</p>
          <p className="text-gray-400 text-sm">PDF内のテキストを選択して質問してください</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white">
      <h2 className="px-4 py-3 border-b border-gray-200 text-sm font-medium text-gray-600 shrink-0">
        {`ハイライト ${highlights.length}件`}
      </h2>
      <ul className="flex-1 overflow-y-auto">
        {newestFirst(highlights).map((highlight) => (
          <li key={highlight.id}>
            <button
              type="button"
              onClick={() =>
                onSelect({
                  id: highlight.id,
                  selectedText: highlight.selectedText,
                  pageNumber: highlight.pageNumber,
                })
              }
              className="flex w-full cursor-pointer items-start gap-3 border-b border-gray-100 px-4 py-3 text-left hover:bg-gray-50"
            >
              <span
                aria-hidden="true"
                style={{ backgroundColor: highlight.color }}
                className="mt-1 h-3 w-3 shrink-0 rounded-full"
              />
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 block text-sm text-gray-700">
                  {highlight.selectedText}
                </span>
                <span className="mt-1 block text-xs text-gray-400">{`${highlight.pageNumber}ページ`}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
