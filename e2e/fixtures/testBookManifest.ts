/**
 * What the generated fixture book contains.
 *
 * `generateTestBook.ts` draws the book from this file and `chatbook.spec.ts`
 * asserts against it, so the page count, the outline and the figure page never
 * drift apart from what the PDF actually holds.
 */

/** The uploaded file name. The shelf shows it without the extension. */
export const FIXTURE_FILE_NAME = "test-book.pdf";
export const FIXTURE_TITLE = "test-book";

/**
 * The cover carries two lines and no spaces, because pdf.js splits a run of
 * text at its spaces: the suite steps forward from the cover until a page has a
 * text layer worth dragging across, so the cover has to stay under that bar.
 */
export const COVER_TITLE = "チャットブック検証用の本";
export const COVER_SUBTITLE = "E2Eテストのために生成された一冊";

/**
 * The pages after the cover. `topic` is the word that makes a page's text
 * unique, so a passage taken from one page resolves to that page alone
 * (`chatService.findPageNumber` returns the first page that contains it).
 */
export const CONTENT_PAGES = [
  { heading: "まえがき", topic: "まえがき" },
  { heading: "第1章 テキストレイヤーの検証", topic: "テキストレイヤー" },
  { heading: "1.1 選択範囲の測定", topic: "選択範囲" },
  { heading: "測定した座標の使いみち", topic: "座標" },
  { heading: "1.2 ハイライトの保存", topic: "ハイライト" },
  { heading: "保存された範囲の読み出し", topic: "読み出し" },
  { heading: "1.3 図版をふくむページ", topic: "図版" },
  { heading: "第2章 チャットとの連携", topic: "チャット" },
  { heading: "出典の解決", topic: "出典" },
  { heading: "引用のページ番号", topic: "引用" },
  { heading: "あとがき", topic: "あとがき" },
];

/** Cover plus the content pages. */
export const PAGE_COUNT = 1 + CONTENT_PAGES.length;

/** Body lines drawn under each content page's heading. */
export const BODY_LINES_PER_PAGE = 6;

/**
 * The page whose body text sits above a figure, where painting order and
 * reading order come apart. The overshoot test drags across its first two lines
 * and checks the selection does not run down into the caption.
 */
export const FIGURE_PAGE = 8;

export interface OutlineEntry {
  title: string;
  page: number;
  children: OutlineEntry[];
}

/**
 * The outline, nested one level deep. Every title is also drawn as that page's
 * heading, and a parent always comes before its children so the generator can
 * add them as it walks the pages in order.
 */
export const OUTLINE: OutlineEntry[] = [
  {
    title: "第1章 テキストレイヤーの検証",
    page: 3,
    children: [
      { title: "1.1 選択範囲の測定", page: 4, children: [] },
      { title: "1.2 ハイライトの保存", page: 6, children: [] },
    ],
  },
  { title: "第2章 チャットとの連携", page: 9, children: [] },
];

/** The heading drawn on a content page, and its body lines. */
export function pageText(pageNumber: number): { heading: string; body: string[] } {
  const content = CONTENT_PAGES[pageNumber - 2];
  const body = Array.from(
    { length: BODY_LINES_PER_PAGE },
    (_, i) => `${content.topic}のページです。${pageNumber}ページ目の${i + 1}行目です。`,
  );
  return { heading: content.heading, body };
}
