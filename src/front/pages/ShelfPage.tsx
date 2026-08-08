// oxlint-disable-next-line no-restricted-imports -- マウント時に一度だけ本棚を取得する。再検証もキャッシュ共有も要らないため SWR は使わない
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router";
import { FileSelector } from "../components/PdfViewer/FileSelector";
import { fetcher } from "../lib/fetcher";

interface Book {
  id: string;
  fileName: string;
  pageCount: number;
  updatedAt: string;
  hasThumbnail: boolean;
}

function bookTitle(fileName: string): string {
  return fileName.replace(/\.pdf$/i, "");
}

function BookCard({ book, onOpen }: { book: Book; onOpen: (id: string) => void }) {
  const [coverFailed, setCoverFailed] = useState(false);
  const showCover = book.hasThumbnail && !coverFailed;
  const title = bookTitle(book.fileName);

  return (
    <button
      type="button"
      onClick={() => onOpen(book.id)}
      className="group flex flex-col text-left cursor-pointer focus:outline-none"
    >
      <div className="relative aspect-3/4 w-full overflow-hidden rounded-r-md rounded-l-sm border-l-4 border-gray-300 bg-gray-100 shadow-md transition-all group-hover:-translate-y-1 group-hover:shadow-xl group-focus-visible:ring-2 group-focus-visible:ring-blue-500">
        {showCover ? (
          <img
            src={`/api/pdf/${book.id}/thumbnail`}
            alt={`${title} の表紙`}
            loading="lazy"
            onError={() => setCoverFailed(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-linear-to-br from-slate-600 to-slate-800 p-3">
            <span className="line-clamp-5 text-center text-xs font-medium text-white/90">
              {title}
            </span>
          </div>
        )}
      </div>
      <p className="mt-2 line-clamp-2 text-sm font-medium text-gray-800">{title}</p>
      <p className="text-xs text-gray-500">{book.pageCount} ページ</p>
    </button>
  );
}

export function ShelfPage() {
  const navigate = useNavigate();
  const [books, setBooks] = useState<Book[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetcher<{ books: Book[] }>("/api/pdfs")
      .then((data) => {
        if (!cancelled) setBooks(data.books);
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err.message);
          setBooks([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const openBook = useCallback((id: string) => navigate(`/books/${id}`), [navigate]);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="flex h-12 items-center justify-between border-b border-gray-200 bg-white px-4">
        <h1 className="text-lg font-bold text-gray-800">chatbook</h1>
        <FileSelector onOpened={openBook} label="PDFを追加" />
      </header>

      <main className="mx-auto max-w-6xl p-6">
        {error && (
          <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-600">
            本棚の読み込みに失敗しました: {error}
          </p>
        )}

        {books === null && <p className="text-sm text-gray-500">読み込み中...</p>}

        {books?.length === 0 && !error && (
          <div className="py-24 text-center">
            <p className="text-lg font-medium text-gray-700">まだ本がありません</p>
            <p className="mt-1 text-sm text-gray-500">
              右上の「PDFを追加」から技術書を追加してください
            </p>
          </div>
        )}

        {books && books.length > 0 && (
          <ul className="grid grid-cols-2 gap-x-5 gap-y-7 sm:grid-cols-3 lg:grid-cols-5">
            {books.map((book) => (
              <li key={book.id}>
                <BookCard book={book} onOpen={openBook} />
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
