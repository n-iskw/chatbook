import { useState, useCallback, useMemo } from "react";
import { Provider, useAtom, useSetAtom } from "jotai";
import { Link, useParams } from "react-router";
import { citedPassageAtom, currentPageAtom } from "../atoms/pdfAtom";
import {
  activeSelectionAtom,
  chatMessagesAtom,
  chatErrorAtom,
  chatPanelOpenAtom,
  chatSheetAtom,
  abortChatStreamAtom,
  type ActiveSelection,
} from "../atoms/chatAtom";
import { PdfViewer } from "../components/PdfViewer/PdfViewer";
import { PageToolbar } from "../components/PdfViewer/PageToolbar";
import { ChatArea } from "../components/ChatArea/ChatArea";
import { ChatSheet } from "../components/ChatArea/ChatSheet";
import { SettingsMenu } from "../components/SettingsMenu";
import { useBook } from "../hooks/useBook";
import { useIsNarrow } from "../hooks/useIsNarrow";
import { useReadingLocation, type PassageMiss } from "../hooks/useReadingLocation";
import { passageFromNavigation } from "../lib/textFragment";
import { fetcher, resultFetcher } from "../lib/fetcher";
import { locatedPageSchema, type LocatedPage } from "../../shared/schemas/book";
import { chatHistorySchema } from "../../shared/schemas/chat";

/** Asks the server which page a passage from a `#:~:text=` link is on. */
async function locatePassage(pdfId: string, passage: string): Promise<LocatedPage> {
  return fetcher(`/api/pdf/${pdfId}/locate?text=${encodeURIComponent(passage)}`, locatedPageSchema);
}

/**
 * What to tell a reader whose link named a passage the book did not open at.
 * "Not found" alone reads as a broken link; each of these is a different thing
 * to do next, and one of them means the quote may not be the book's words.
 */
const PASSAGE_MISS_MESSAGE: Record<PassageMiss, string> = {
  "not-in-book": "リンクされた箇所が本文に見つかりませんでした",
  "no-quote": "リンクに引用文が入っていません",
  "single-page-book": "この本は1ページなので移動先がありません",
  "lookup-failed": "リンクされた箇所を探せませんでした",
};

/**
 * The reader, with a store of its own per book.
 *
 * Everything it holds — the open chat, the passage being asked about, the page
 * being read — belongs to one book and means nothing under the next one. Giving
 * the store the book's id as its key throws all of it away in a single step
 * when another book is opened, instead of resetting each piece by hand and
 * rendering once with whatever was missed. The book itself survives the swap:
 * it lives in the SWR cache, which is outside the store.
 */
export function AppPage() {
  const { pdfId } = useParams();

  return (
    <Provider key={pdfId}>
      <BookReader pdfId={pdfId} />
    </Provider>
  );
}

function BookReader({ pdfId }: { pdfId: string | undefined }) {
  const { data: book, error } = useBook(pdfId);
  const [, setActiveSelection] = useAtom(activeSelectionAtom);
  const [, setChatMessages] = useAtom(chatMessagesAtom);
  const [, setChatError] = useAtom(chatErrorAtom);
  const [, setCurrentPage] = useAtom(currentPageAtom);
  const setCitedPassage = useSetAtom(citedPassageAtom);
  const [chatPanelOpen, setChatPanelOpen] = useAtom(chatPanelOpenAtom);
  const [chatSheet, setChatSheet] = useAtom(chatSheetAtom);
  const abortChatStream = useSetAtom(abortChatStreamAtom);
  const [leftWidth, setLeftWidth] = useState(60);
  const isNarrow = useIsNarrow();

  // Only the URL the document was loaded with can carry a text fragment
  const linkedPassage = useMemo(
    () => passageFromNavigation(performance.getEntriesByType("navigation")),
    [],
  );

  /**
   * Put a highlight's conversation on screen, with whatever was asked before.
   *
   * Which page the reader is on is deliberately not part of this: a chat picked
   * off the list moves the page to its passage, while one restored from the URL
   * leaves the page that same URL named alone.
   */
  const openChat = useCallback(
    async (selection: ActiveSelection) => {
      // An answer still streaming belongs to the chat being left behind
      abortChatStream();
      setActiveSelection(selection);
      // Otherwise the conversation left behind shows under the new passage
      // until its own history arrives
      setChatMessages([]);
      // Whatever failed in the chat being left is not about this one
      setChatError(null);
      // The passage a citation of the previous chat pointed at is not this
      // highlight's, and both would otherwise be marked on the same page
      setCitedPassage(null);
      // On one column the conversation waits out of the way until it is asked
      // for, and opening a highlight — off the page, off the list, or out of a
      // link — is the asking. A sheet already drawn up is left where it is.
      if (isNarrow) setChatSheet((sheet) => (sheet === "closed" ? "half" : sheet));
      if (!pdfId) return;

      const history = await resultFetcher(
        `/api/pdf/${pdfId}/selections/${selection.id}/chats`,
        chatHistorySchema,
      );

      // An empty conversation and one that could not be read used to look the
      // same, so a failure here read as "you never asked anything about this".
      history.match(
        (data) => setChatMessages(data.messages),
        (failure) => setChatError(`チャット履歴を読み込めませんでした: ${failure.message}`),
      );
    },
    [
      abortChatStream,
      isNarrow,
      pdfId,
      setActiveSelection,
      setChatError,
      setChatMessages,
      setChatSheet,
      setCitedPassage,
    ],
  );

  const { passageMiss } = useReadingLocation(pdfId, locatePassage, linkedPassage, book, openChat);

  const handleSelectionClick = useCallback(
    (selection: ActiveSelection) => {
      // The highlight can be picked from the list while another page is shown
      setCurrentPage(selection.pageNumber);
      // Nothing to wait for: reading the history in shows it, and a history that
      // could not be read says so through `chatErrorAtom`
      void openChat(selection);
    },
    [openChat, setCurrentPage],
  );

  return (
    // `dvh` rather than `vh`: mobile browsers count their collapsing toolbars
    // out of the former, so the bottom of the reader is not left under them.
    // `overflow-clip` because the sheet parks itself outside the pane it slides
    // into, and a scrollable shell would let a focused composer drag the whole
    // reader up to reach it.
    <div className="h-dvh flex flex-col bg-white overflow-clip">
      <header className="flex items-center h-12 px-4 border-b border-gray-200 bg-gray-50 shrink-0">
        {/* Two links to the shelf is one too many on a phone, and the wordmark
            is the one that says nothing the other does not. */}
        <Link
          to="/"
          className="hidden shrink-0 text-lg font-bold text-gray-800 hover:text-blue-600 md:block"
        >
          chatbook
        </Link>
        {/* Never wrapped: squeezed onto two lines it reads as two words rather
            than one way out. Whatever room is short comes out of the title. */}
        <Link
          to="/"
          className="shrink-0 whitespace-nowrap text-sm text-blue-600 hover:underline md:ml-4"
        >
          ← 本棚
        </Link>
        {book && (
          <span className="ml-3 min-w-0 flex-1 truncate text-sm text-gray-500 md:flex-none md:max-w-xs">
            {book.fileName}
          </span>
        )}
        {/* The toggle lives up here rather than in the panel it folds away,
            which would take the way back out with it. On one column there is no
            panel to fold: the toolbar at the bottom raises the sheet instead,
            within reach of a thumb. */}
        <div className="ml-auto flex items-center gap-3">
          {!isNarrow && (
            <button
              type="button"
              onClick={() => setChatPanelOpen((open) => !open)}
              aria-pressed={chatPanelOpen}
              className="px-3 py-1 bg-white border rounded cursor-pointer text-sm text-gray-600 hover:bg-gray-50"
            >
              {chatPanelOpen ? "チャットを隠す" : "チャットを表示"}
            </button>
          )}
          <SettingsMenu />
        </div>
      </header>

      {/* A link that named a passage but did not land on it opens the book at
          page 1, which is indistinguishable from an ordinary link. */}
      {passageMiss !== null && (
        <p role="status" className="shrink-0 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          {PASSAGE_MISS_MESSAGE[passageMiss]}: {linkedPassage}
        </p>
      )}

      {/* `relative` so the sheet can be bounded by the page's pane, which ends
          above the toolbar rather than at the bottom of the window. */}
      <main className="relative flex-1 min-h-0 flex">
        {/* Left panel: PDF Viewer. It takes the whole width the folded panel
            leaves behind, and gets its share back on the way out. */}
        <div
          style={isNarrow ? undefined : { width: chatPanelOpen ? `${leftWidth}%` : "100%" }}
          className={`h-full min-w-0 ${isNarrow ? "w-full" : ""}`}
        >
          <PdfViewer
            book={book}
            bookError={error as Error | undefined}
            onSelectionClick={handleSelectionClick}
          />
        </div>

        {isNarrow && (
          <ChatSheet state={chatSheet} onChange={setChatSheet}>
            <ChatArea
              book={book}
              bookError={error as Error | undefined}
              onSelectionClick={handleSelectionClick}
            />
          </ChatSheet>
        )}

        {/* The handle and the panel it sizes come and go together: a handle for
            a panel that is not there has nothing to drag. */}
        {!isNarrow && chatPanelOpen && (
          <>
            {/* Resize handle */}
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="PDFとチャットの幅を変更"
              className="w-1.5 bg-gray-200 hover:bg-blue-400 cursor-col-resize shrink-0 transition-colors active:bg-blue-500"
              onMouseDown={(e) => {
                e.preventDefault();
                const startX = e.clientX;
                const startWidth = leftWidth;

                const handleMouseMove = (moveEvent: MouseEvent) => {
                  const delta = ((moveEvent.clientX - startX) / window.innerWidth) * 100;
                  const newWidth = Math.min(80, Math.max(20, startWidth + delta));
                  setLeftWidth(newWidth);
                };

                const handleMouseUp = () => {
                  document.removeEventListener("mousemove", handleMouseMove);
                  document.removeEventListener("mouseup", handleMouseUp);
                };

                document.addEventListener("mousemove", handleMouseMove);
                document.addEventListener("mouseup", handleMouseUp);
              }}
            />

            {/* Right panel: Chat Area */}
            <div style={{ width: `${100 - leftWidth}%` }} className="h-full min-w-0">
              <ChatArea
                book={book}
                bookError={error as Error | undefined}
                onSelectionClick={handleSelectionClick}
              />
            </div>
          </>
        )}
      </main>

      {isNarrow && book && (
        <PageToolbar
          pageCount={book.pageCount}
          highlightCount={book.selections.length}
          chatOpen={chatSheet !== "closed"}
          onToggleChat={() => setChatSheet(chatSheet === "closed" ? "half" : "closed")}
        />
      )}
    </div>
  );
}
