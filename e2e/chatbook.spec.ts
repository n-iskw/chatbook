import { test, expect, type Locator, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  FIGURE_PAGE,
  FIXTURE_FILE_NAME,
  FIXTURE_TITLE,
  OUTLINE,
  PAGE_COUNT,
  pageText,
} from "./fixtures/testBookManifest.ts";

/**
 * The book these tests read, drawn by `fixtures/generateTestBook.ts` and
 * committed alongside it. Everything asserted about it — the page count, the
 * outline, the figure page — comes from `fixtures/testBookManifest.ts`.
 */
const TEST_PDF = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  FIXTURE_FILE_NAME,
);

/** The page counter in the viewer's toolbar. */
function pageLabel(pageNumber: number): string {
  return `${pageNumber} / ${PAGE_COUNT}`;
}

/**
 * A book of an API test's own, as a multipart file field.
 *
 * A re-open overwrites the stored metadata, so posting the fixture's own bytes
 * with a placeholder fullText would wipe the extracted text of the book the
 * other tests are reading, which the citation and text-fragment lookups need. A
 * trailing PDF comment keeps the file valid while giving it a hash of its own,
 * and the distinct name keeps these books apart from the fixture on the shelf.
 */
function apiFixtureFile(tag: string) {
  return {
    name: `${tag}.pdf`,
    mimeType: "application/pdf",
    buffer: Buffer.concat([fs.readFileSync(TEST_PDF), Buffer.from(`\n%${tag}\n`)]),
  };
}

/**
 * Upload the fixture book (idempotent by hash) and land in the reader.
 *
 * The run starts from an empty store, but highlights persist for the rest of
 * it, and they sit above the text layer to stay clickable. Leftovers from an
 * earlier test would cover the text and block selection, so start every test
 * from a book with no highlights.
 */
async function openTestBook(page: Page): Promise<string> {
  await page.goto("/");
  await page.setInputFiles('input[type="file"]', TEST_PDF);
  await expect(page.getByText(pageLabel(1), { exact: true })).toBeVisible({ timeout: 60000 });

  const pdfId = new URL(page.url()).pathname.split("/").pop()!;
  const { selections } = (await (await page.request.get(`/api/pdf/${pdfId}`)).json()) as {
    selections: { id: string }[];
  };
  for (const selection of selections) {
    await page.request.delete(`/api/pdf/${pdfId}/selections/${selection.id}`);
  }

  if (selections.length > 0) {
    await page.reload();
    await expect(page.getByText(pageLabel(1), { exact: true })).toBeVisible({ timeout: 60000 });
  }
  return pdfId;
}

/**
 * How far the page pane is scrolled. The pane is found from the canvas rather
 * than by class name, and -1 is returned when nothing overflows — a scroll
 * assertion against a pane that cannot scroll would pass no matter what.
 */
async function pageScrollTop(page: Page): Promise<number> {
  return page.locator("canvas.block").evaluate((canvas) => {
    let el = canvas.parentElement;
    while (el && el.scrollHeight <= el.clientHeight) el = el.parentElement;
    return el ? el.scrollTop : -1;
  });
}

/**
 * The cover page carries almost no selectable text, so step forward until the
 * rendered page has a text layer worth dragging across.
 */
async function goToPageWithText(page: Page, minSpans = 5) {
  const spans = page.locator(".textLayer span");
  for (let i = 0; i < 15; i++) {
    if ((await spans.count()) >= minSpans) return;
    await page.getByRole("button", { name: "次へ" }).click();
    await page.waitForTimeout(400);
  }
  throw new Error("no page with a text layer was found");
}

test("app loads and shows the shelf", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("text=chatbook")).toBeVisible();
  await expect(page.getByRole("button", { name: "PDFを追加" })).toBeVisible();
});

/** Console output naming a pdf.js asset the viewer failed to fetch. */
function collectFontErrors(page: Page): string[] {
  const fontErrors: string[] = [];
  page.on("console", (msg) => {
    const text = msg.text();
    if (text.includes("cMapUrl") || text.includes("standardFontDataUrl")) {
      fontErrors.push(text);
    }
  });
  return fontErrors;
}

/**
 * The share of the rendered page that is not white. A blank canvas means the
 * fonts (CMap / standard font data) failed to load.
 */
async function inkRatio(page: Page): Promise<number> {
  const canvas = page.locator("canvas.block");
  await expect(canvas).toBeVisible({ timeout: 60000 });
  return canvas.evaluate((el) => {
    const c = el as HTMLCanvasElement;
    const ctx = c.getContext("2d")!;
    const { data } = ctx.getImageData(0, 0, c.width, c.height);
    let ink = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] < 250 || data[i + 1] < 250 || data[i + 2] < 250) ink++;
    }
    return ink / (data.length / 4);
  });
}

test("adding a PDF from the shelf opens the reader and renders its pages", async ({ page }) => {
  await page.goto("/");
  await page.setInputFiles('input[type="file"]', TEST_PDF);

  // Uploading navigates into the reader for that book, on its first page, with
  // the chat panel showing
  await expect(page).toHaveURL(/\/books\/[A-Z0-9]+\?page=1&panel=open$/, { timeout: 60000 });

  // The viewer shows the real page count from client-side extraction
  await expect(page.getByText(pageLabel(1), { exact: true })).toBeVisible({ timeout: 60000 });

  // The cover is text on white, so ink means the glyphs were drawn
  expect(await inkRatio(page)).toBeGreaterThan(0.001);
});

/**
 * The fixture embeds every Japanese glyph it draws, so pdf.js reads it without
 * a predefined CMap. Books from a publisher do not: their fonts are CID-keyed
 * and pdf.js has to fetch the CMap tables to draw them at all. Only a real book
 * can show that `cMapUrl` is still reaching pdf.js, so this one test keeps its
 * own file, and skips where that file is not to be found.
 */
const PUBLISHED_BOOK = path.join(
  process.env.HOME!,
  "Documents",
  "資料",
  "本",
  "Web開発者のための［入門］Cloudflare-Workers-――JavaScript・TypeScriptの簡単・高速プラットフォーム_00.pdf",
);

test("a book with CID-keyed fonts renders without asking for a CMap", async ({ page }) => {
  if (!fs.existsSync(PUBLISHED_BOOK)) {
    test.skip(true, "no published book to read on this machine");
    return;
  }

  const fontErrors = collectFontErrors(page);

  await page.goto("/");
  await page.setInputFiles('input[type="file"]', PUBLISHED_BOOK);
  await expect(page).toHaveURL(/\/books\//, { timeout: 60000 });

  expect(await inkRatio(page)).toBeGreaterThan(0.001);
  expect(fontErrors).toEqual([]);
});

test("the shelf lists the book with a real cover image, sizes every card alike, and opens it", async ({
  page,
}) => {
  // Make sure the book exists on the shelf (upload is idempotent by hash)
  await page.goto("/");
  await page.setInputFiles('input[type="file"]', TEST_PDF);
  await expect(page).toHaveURL(/\/books\//, { timeout: 60000 });

  // A second book with no thumbnail, so the shelf falls back to the title
  // placeholder. The placeholder is laid out from its text, which is what made
  // the cards differ in size from each other.
  await page.request.post("/api/pdf/open", {
    multipart: {
      file: apiFixtureFile("shelf-card-size"),
      fullText: "A book stored without a cover image.",
      pageCount: String(PAGE_COUNT),
    },
  });

  await page.goto("/");

  // Earlier runs may have left books of the same name on the shelf, so take the
  // first match rather than requiring the title to be unique
  const cover = page.getByRole("img", { name: `${FIXTURE_TITLE} の表紙` }).first();
  await expect(cover).toBeVisible({ timeout: 30000 });

  // The <img> must actually decode; a broken cover URL would still be "visible"
  await expect
    .poll(() => cover.evaluate((el) => (el as HTMLImageElement).naturalWidth), { timeout: 30000 })
    .toBeGreaterThan(0);

  // Both a cover and a placeholder are on the shelf now, so comparing the card
  // sizes covers the case that used to break
  await expect(page.getByRole("button", { name: "shelf-card-size" }).first()).toBeVisible();

  const cardSizes = await page.locator("ul li button > div").evaluateAll((els) =>
    els.map((el) => {
      const { width, height } = el.getBoundingClientRect();
      return `${Math.round(width)}x${Math.round(height)}`;
    }),
  );

  expect(cardSizes.length).toBeGreaterThan(1);
  expect(new Set(cardSizes)).toEqual(new Set([cardSizes[0]]));
  expect(cardSizes[0]).not.toBe("0x0");

  await page.getByRole("button", { name: FIXTURE_TITLE }).first().click();
  await expect(page).toHaveURL(/\/books\//);
  await expect(page.getByText(pageLabel(1), { exact: true })).toBeVisible({ timeout: 60000 });
});

test("reloading the reader keeps the book open", async ({ page }) => {
  await page.goto("/");
  await page.setInputFiles('input[type="file"]', TEST_PDF);
  await expect(page.getByText(pageLabel(1), { exact: true })).toBeVisible({ timeout: 60000 });

  await page.reload();

  // Restored from the URL, not from the upload that filled the atom
  await expect(page.getByText(pageLabel(1), { exact: true })).toBeVisible({ timeout: 60000 });
});

/**
 * The rendered page width once it stops changing.
 *
 * Fitting the page to the panel goes through a ResizeObserver and a re-render,
 * so the canvas keeps an earlier size for a moment after the layout settles.
 */
async function settledCanvasWidth(page: Page): Promise<number> {
  const canvas = page.locator("canvas.block");
  let previous = -1;

  for (let i = 0; i < 25; i++) {
    const width = (await canvas.boundingBox())!.width;
    if (width === previous) return width;
    previous = width;
    await page.waitForTimeout(200);
  }
  throw new Error("the rendered page never settled on a width");
}

/**
 * The drawn page next to the area it is drawn into, both settled.
 *
 * The pane is found by walking up from the canvas to the element that scrolls,
 * so this does not depend on the viewer's class names, and its padding is taken
 * off: that is the room the page actually has.
 */
async function drawnPageAndPane(page: Page) {
  await settledCanvasWidth(page);

  return page.locator("canvas.block").evaluate((canvas) => {
    let pane = canvas.parentElement;
    while (pane && getComputedStyle(pane).overflowY !== "auto") pane = pane.parentElement;
    if (!pane) throw new Error("the scrolling pane around the page was not found");

    const style = getComputedStyle(pane);
    const box = canvas.getBoundingClientRect();
    return {
      page: { width: box.width, height: box.height },
      pane: {
        width: pane.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
        height: pane.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom),
      },
    };
  });
}

test("the whole page is visible whether the chat panel is open or folded away", async ({
  page,
}) => {
  await openTestBook(page);

  // Fitting on width alone drew the page taller than the pane, so the foot of
  // every page was off screen — worse the wider the pane got.
  const withPanel = await drawnPageAndPane(page);
  expect(withPanel.page.width).toBeGreaterThan(0);
  expect(withPanel.page.height).toBeLessThanOrEqual(withPanel.pane.height);
  expect(withPanel.page.width).toBeLessThanOrEqual(withPanel.pane.width);

  await page.getByRole("button", { name: "チャットを隠す" }).click();

  const alone = await drawnPageAndPane(page);
  expect(alone.page.height).toBeLessThanOrEqual(alone.pane.height);
  expect(alone.page.width).toBeLessThanOrEqual(alone.pane.width);
});

/**
 * Pinch out over the middle of the page, as a trackpad reports it: a wheel
 * event with ctrlKey set.
 */
async function pinchOut(page: Page, times = 1) {
  const box = (await page.locator("canvas.block").boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.down("Control");
  for (let i = 0; i < times; i++) await page.mouse.wheel(0, -100);
  await page.keyboard.up("Control");
}

test("a pinch zooms the page in, and the book opens at that zoom next time", async ({ page }) => {
  await openTestBook(page);
  const fitted = await settledCanvasWidth(page);

  await pinchOut(page);

  const zoomed = await settledCanvasWidth(page);
  expect(zoomed).toBeGreaterThan(fitted * 1.4);

  // The reader's zoom belongs to the book, not to the session: the store the
  // reader holds it in is thrown away on every trip through the shelf.
  await page.reload();
  await expect(page.getByText(pageLabel(1), { exact: true })).toBeVisible({ timeout: 60000 });

  expect(await settledCanvasWidth(page)).toBeGreaterThan(fitted * 1.4);
});

test("a passage can still be selected once the page is zoomed in", async ({ page }) => {
  await openTestBook(page);
  await goToPageWithText(page);
  const fitted = await settledCanvasWidth(page);

  await pinchOut(page);

  // Without this the rest would be a selection test at the fit scale again
  expect(await settledCanvasWidth(page)).toBeGreaterThan(fitted * 1.4);

  // The text layer is positioned from `--scale-factor`; left at the fit scale
  // it would put the spans somewhere other than the words on the canvas
  const line = page.locator(".textLayer span").first();
  const box = (await line.boundingBox())!;
  await page.mouse.move(box.x + 1, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 1, box.y + box.height / 2, { steps: 12 });
  await page.mouse.up();

  const selected = await page.evaluate(() => window.getSelection()?.toString() ?? "");
  expect(selected.trim().length).toBeGreaterThan(0);
  await expect(page.getByRole("button", { name: "質問する" })).toBeVisible({ timeout: 10000 });

  // The mark is drawn over the line that was dragged, not where an unzoomed
  // text layer would have put it
  const marks = page.locator(".pendingSelection");
  await expect(marks.first()).toBeVisible();
  expect(await lowestMark(marks)).toBeLessThan(box.y + box.height + 20);
});

/** The page number shown in the viewer's toolbar. */
async function currentPage(page: Page): Promise<number> {
  const label = await page.getByText(new RegExp(`^\\d+ / ${PAGE_COUNT}$`)).textContent();
  return Number(label!.split("/")[0].trim());
}

test("reloading resumes on the page being read", async ({ page }) => {
  await openTestBook(page);
  await page.getByRole("button", { name: "次へ" }).click();
  await page.getByRole("button", { name: "次へ" }).click();
  await expect(page.getByText(pageLabel(3), { exact: true })).toBeVisible();

  // The page being read is in the URL, so it survives a reload
  await expect(page).toHaveURL(/[?&]page=3/);
  await page.reload();

  await expect(page.getByText(pageLabel(3), { exact: true })).toBeVisible({ timeout: 60000 });
});

test("a browser text-fragment link opens the page holding the passage", async ({ page }) => {
  const pdfId = await openTestBook(page);
  await goToPageWithText(page);
  const expectedPage = await currentPage(page);
  expect(expectedPage).toBeGreaterThan(1);

  // Take a passage long enough to appear on exactly one page, the way Chrome's
  // "Copy link to highlight" would capture a selection. Running headers repeat
  // across pages, so a short one could resolve to an earlier page.
  const spans = await page.locator(".textLayer span").allTextContents();
  let passage = "";
  for (const span of spans) {
    passage = `${passage}${span}`.trim();
    if (passage.length >= 40) break;
  }
  expect(passage.length).toBeGreaterThanOrEqual(40);

  await page.goto(`/books/${pdfId}#:~:text=${encodeURIComponent(passage)}`);

  await expect(page.getByText(pageLabel(expectedPage), { exact: true })).toBeVisible({
    timeout: 60000,
  });
});

test("dragging over the page selects text and offers to ask about it", async ({ page }) => {
  await openTestBook(page);
  await goToPageWithText(page);

  // Nothing may cover the page: the text layer has to receive the pointer
  const canvas = page.locator("canvas.block");
  const canvasBox = (await canvas.boundingBox())!;
  const topmost = await page.evaluate(
    ([x, y]) => {
      const el = document.elementFromPoint(x, y);
      return el?.className?.toString() ?? "";
    },
    [canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height / 2] as const,
  );
  expect(topmost).not.toContain("absolute top-0 left-0");

  // Drag across a line of text the way a user would
  const line = page.locator(".textLayer span").first();
  const box = (await line.boundingBox())!;
  await page.mouse.move(box.x + 1, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 1, box.y + box.height / 2, { steps: 12 });
  await page.mouse.up();

  const selected = await page.evaluate(() => window.getSelection()?.toString() ?? "");
  expect(selected.trim().length).toBeGreaterThan(0);

  // The selection opens the question popover
  await expect(page.getByRole("button", { name: "質問する" })).toBeVisible({ timeout: 10000 });
});

test("the passage is marked while it is still being dragged", async ({ page }) => {
  await openTestBook(page);
  await goToPageWithText(page);

  const line = page.locator(".textLayer span").first();
  const box = (await line.boundingBox())!;
  await page.mouse.move(box.x + 1, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 1, box.y + box.height / 2, { steps: 12 });

  // Still holding the button: the app draws the selection itself, because the
  // browser's own colour doubles up where pdf.js' spans overlap
  await expect(page.locator(".pendingSelection").first()).toBeVisible();

  await page.mouse.up();
});

test("the selected passage stays marked while the question is written", async ({ page }) => {
  await openTestBook(page);
  await goToPageWithText(page);

  const line = page.locator(".textLayer span").first();
  const box = (await line.boundingBox())!;
  await page.mouse.move(box.x + 1, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 1, box.y + box.height / 2, { steps: 12 });
  await page.mouse.up();

  await expect(page.getByRole("button", { name: "質問する" })).toBeVisible({ timeout: 10000 });

  // Focusing the question box clears the browser's own selection, so without a
  // mark of our own the reader loses track of what the question is about
  const marks = page.locator(".pendingSelection");
  await expect(marks.first()).toBeVisible();

  const markBox = (await marks.first().boundingBox())!;
  expect(markBox.width).toBeGreaterThan(0);
  expect(markBox.height).toBeGreaterThan(0);
});

/** How far down the page the drawn selection reaches. */
async function lowestMark(marks: Locator): Promise<number> {
  return marks.evaluateAll((nodes) =>
    Math.max(...nodes.map((n) => n.getBoundingClientRect().bottom)),
  );
}

test("overshooting a line does not select the rest of the page", async ({ page }) => {
  const pdfId = await openTestBook(page);
  // A page whose body text sits above a figure, which is where painting order
  // and reading order come apart
  await page.goto(`/books/${pdfId}?page=${FIGURE_PAGE}`);
  await expect(page.getByText(pageLabel(FIGURE_PAGE), { exact: true })).toBeVisible({
    timeout: 60000,
  });
  await page.waitForTimeout(1200);

  // pdf.js lays spans out in painting order, not reading order, so a drag that
  // ends past the end of a line can run on to a figure's labels further down
  const drag = await page.evaluate(() => {
    const canvas = document.querySelector("canvas.block")!.getBoundingClientRect();
    // The page can be taller than the pane, so only work with what is on screen
    const onScreen = Array.from(document.querySelectorAll(".textLayer span"))
      .map((s) => s.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.top > Math.max(canvas.top, 80) && r.bottom < innerHeight - 80)
      .sort((a, b) => a.top - b.top || a.left - b.left);

    const first = onScreen[0];
    const nextLine = onScreen.find((r) => r.top > first.bottom - first.height / 2);
    if (!first || !nextLine) throw new Error("no two lines of text are visible");

    return {
      startX: first.left + 4,
      startY: first.top + first.height / 2,
      // Release in the empty margin to the right of the second line
      endX: canvas.right - 6,
      endY: nextLine.top + nextLine.height / 2,
      lineBottom: nextLine.bottom,
    };
  });

  const marks = page.locator(".pendingSelection");

  await page.mouse.move(drag.startX, drag.startY);
  await page.mouse.down();
  await page.mouse.move(drag.endX, drag.endY, { steps: 20 });

  // Mid-drag: the guard parks the overshoot inside a page-sized element, so
  // check the mark does not inherit its size before the button is released
  await expect(marks.first()).toBeVisible();
  expect(await lowestMark(marks)).toBeLessThan(drag.lineBottom + 20);

  await page.mouse.up();

  await expect(page.getByRole("button", { name: "質問する" })).toBeVisible({ timeout: 10000 });

  // The drag covered two lines, so nothing should be marked below the second
  // one. Anything further down means the selection ran off through the DOM.
  await expect(marks.first()).toBeVisible();
  expect(await lowestMark(marks)).toBeLessThan(drag.lineBottom + 20);
});

test("the reader fits the viewport without scrolling the page", async ({ page }) => {
  await openTestBook(page);
  // Rendering a text layer is what appends pdf.js' measurement canvas to <body>
  await goToPageWithText(page);

  // The reader owns the whole viewport; only its inner panes scroll. A taller
  // document means stray content is pushing the page down.
  const { scrollHeight, clientHeight } = await page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    clientHeight: document.documentElement.clientHeight,
  }));
  expect(scrollHeight).toBeLessThanOrEqual(clientHeight);

  // pdf.js appends a measurement canvas to <body>. Its size is only zero part
  // of the time, so assert it is kept out of layout entirely rather than
  // relying on the box it happens to have right now.
  const measurementCanvasDisplay = await page.evaluate(() => {
    const canvas = document.querySelector("canvas.hiddenCanvasElement");
    return canvas ? getComputedStyle(canvas).display : "absent";
  });
  expect(["absent", "none"]).toContain(measurementCanvasDisplay);
});

test("the outline lists chapters and jumps to the selected one", async ({ page }) => {
  await openTestBook(page);

  const [firstChapter] = OUTLINE;
  const [firstSection, secondSection] = firstChapter.children;
  // Each entry reads as its title followed by the page it resolved to
  const entryName = (entry: { title: string; page: number }) => `${entry.title} ${entry.page}`;

  const outline = page.getByRole("navigation", { name: "目次" });
  const chapter = outline.getByRole("button", { name: entryName(firstChapter), exact: true });
  await expect(chapter).toBeVisible({ timeout: 30000 });

  // Nested sections are listed too
  await expect(
    outline.getByRole("button", { name: entryName(firstSection), exact: true }),
  ).toBeVisible();

  await chapter.click();
  await expect(page.getByText(pageLabel(firstChapter.page), { exact: true })).toBeVisible({
    timeout: 10000,
  });

  // Nested entries resolve to their own page
  await outline.getByRole("button", { name: entryName(secondSection), exact: true }).click();
  await expect(page.getByText(pageLabel(secondSection.page), { exact: true })).toBeVisible({
    timeout: 10000,
  });
});

test("vim keys turn pages, scroll, and toggle the outline by default", async ({ page }) => {
  await openTestBook(page);
  const outline = page.getByRole("navigation", { name: "目次" });
  await expect(outline).toBeVisible();

  await page.keyboard.press("l");
  await expect(page.getByText(pageLabel(2), { exact: true })).toBeVisible();

  await page.keyboard.press("h");
  await expect(page.getByText(pageLabel(1), { exact: true })).toBeVisible();

  // j/k move within the page instead of turning it
  const restingTop = await pageScrollTop(page);
  expect(restingTop).toBe(0);

  await page.keyboard.press("j");
  await expect.poll(() => pageScrollTop(page)).toBeGreaterThan(0);
  await expect(page.getByText(pageLabel(1), { exact: true })).toBeVisible();

  await page.keyboard.press("k");
  await expect.poll(() => pageScrollTop(page)).toBe(0);

  // A page turn starts the next page at its top, wherever the last one was left
  await page.keyboard.press("j");
  await expect.poll(() => pageScrollTop(page)).toBeGreaterThan(0);
  await page.keyboard.press("l");
  await expect(page.getByText(pageLabel(2), { exact: true })).toBeVisible();
  await expect.poll(() => pageScrollTop(page)).toBe(0);

  await page.keyboard.press("t");
  await expect(outline).toBeHidden();
  await page.keyboard.press("t");
  await expect(outline).toBeVisible();

  // gg / G jump to the ends of the book
  await page.keyboard.press("Shift+G");
  await expect(page.getByText(pageLabel(PAGE_COUNT), { exact: true })).toBeVisible();
  await page.keyboard.press("g");
  await page.keyboard.press("g");
  await expect(page.getByText(pageLabel(1), { exact: true })).toBeVisible();
});

test("switching to emacs in settings changes the bindings and survives a reload", async ({
  page,
}) => {
  await openTestBook(page);

  await page.getByRole("button", { name: "設定", exact: true }).click();
  await page.getByRole("radio", { name: "Emacs" }).check();
  await page.keyboard.press("Escape");

  // The vim binding is gone...
  await page.keyboard.press("l");
  await expect(page.getByText(pageLabel(1), { exact: true })).toBeVisible();

  // ...and the emacs one works
  await page.keyboard.press("Control+n");
  await expect(page.getByText(pageLabel(2), { exact: true })).toBeVisible();

  // C-c t is a two-stroke sequence
  const outline = page.getByRole("navigation", { name: "目次" });
  await page.keyboard.press("Control+c");
  await page.keyboard.press("t");
  await expect(outline).toBeHidden();

  await page.reload();
  // The reload resumes on the page that was being read, not back at the cover
  await expect(page.getByText(pageLabel(2), { exact: true })).toBeVisible({ timeout: 60000 });

  await page.getByRole("button", { name: "設定", exact: true }).click();
  await expect(page.getByRole("radio", { name: "Emacs" })).toBeChecked();
});

test("typing in the chat box does not trigger shortcuts", async ({ page }) => {
  // Activate a selection so the chat input renders
  const pdfId = await openTestBook(page);
  await page.request.post(`/api/pdf/${pdfId}/selections`, {
    data: {
      selectedText: "検証用のハイライト",
      pageNumber: 1,
      positionData: {
        startIndex: 0,
        endIndex: 1,
        rects: [{ x: 40, y: 40, width: 160, height: 24 }],
      },
    },
  });
  await page.reload();
  await page.getByRole("button", { name: "ハイライトのチャットを開く" }).click();

  const restingTop = await pageScrollTop(page);
  expect(restingTop).toBe(0);

  const input = page.getByPlaceholder("質問を入力...");
  await input.click();
  await input.fill("");

  // Check the scroll before typing k: k would undo j's scroll, leaving the pane
  // back at 0 and the assertion unable to tell a stray scroll from none at all.
  await page.keyboard.type("hlj");
  expect(await pageScrollTop(page)).toBe(0);

  await page.keyboard.type("kt");

  // Every binding stays inert: no page turn (h/l), no scroll (j/k), no outline (t)
  await expect(input).toHaveValue("hljkt");
  await expect(page.getByText(pageLabel(1), { exact: true })).toBeVisible();
  expect(await pageScrollTop(page)).toBe(0);
  await expect(page.getByRole("navigation", { name: "目次" })).toBeVisible();
});

test("the book title stays in the reader header instead of the chat panel", async ({ page }) => {
  const pdfId = await openTestBook(page);
  await page.request.post(`/api/pdf/${pdfId}/selections`, {
    data: {
      selectedText: "検証用のハイライト",
      pageNumber: 1,
      positionData: {
        startIndex: 0,
        endIndex: 1,
        rects: [{ x: 40, y: 40, width: 160, height: 24 }],
      },
    },
  });
  await page.reload();
  await page.getByRole("button", { name: "ハイライトのチャットを開く" }).click();

  await expect(page.getByRole("banner").getByText(FIXTURE_FILE_NAME)).toBeVisible();

  // The chat panel is for the conversation; repeating the title there only ate
  // vertical space
  const chatPanel = page.locator("main > div").last();
  await expect(chatPanel.getByPlaceholder("質問を入力...")).toBeVisible();
  await expect(chatPanel.getByText(FIXTURE_FILE_NAME)).toBeHidden();
});

test("the chat panel lists the highlights, opens one, and comes back to the list", async ({
  page,
}) => {
  const pdfId = await openTestBook(page);
  // Lines that really are on those pages, so the panel and the page's text
  // layer show the same words and the scoping below is doing something
  const firstPassage = pageText(2).body[0];
  const laterPassage = pageText(3).body[0];
  for (const [passage, pageNumber] of [
    [firstPassage, 2],
    [laterPassage, 3],
  ] as const) {
    await page.request.post(`/api/pdf/${pdfId}/selections`, {
      data: {
        selectedText: passage,
        pageNumber,
        positionData: {
          startIndex: 0,
          endIndex: passage.length,
          rects: [{ x: 40, y: 40, width: 160, height: 24 }],
        },
      },
    });
  }
  await page.reload();

  // Scope to the panel: these passages can also appear in the page's text layer
  const chatPanel = page.locator("main > div").last();

  // No conversation is open, so the panel is the way into the past ones
  await expect(chatPanel.getByText("ハイライト 2件")).toBeVisible({ timeout: 60000 });
  await expect(chatPanel.getByText(firstPassage, { exact: true })).toBeVisible();

  // Opening a highlight of another page brings the viewer along
  await chatPanel.getByText(laterPassage, { exact: true }).click();
  await expect(chatPanel.getByPlaceholder("質問を入力...")).toBeVisible();
  await expect(page.getByText(pageLabel(3), { exact: true })).toBeVisible();

  await chatPanel.getByRole("button", { name: "一覧に戻る" }).click();
  await expect(chatPanel.getByText("ハイライト 2件")).toBeVisible();
  await expect(chatPanel.getByPlaceholder("質問を入力...")).toBeHidden();
});

test("reloading brings back the folded panel and the chat that was open in it", async ({
  page,
}) => {
  const pdfId = await openTestBook(page);
  const passage = pageText(2).body[0];
  await page.request.post(`/api/pdf/${pdfId}/selections`, {
    data: {
      selectedText: passage,
      pageNumber: 1,
      positionData: {
        startIndex: 0,
        endIndex: passage.length,
        rects: [{ x: 40, y: 40, width: 160, height: 24 }],
      },
    },
  });
  await page.reload();

  // Scope to the panel: the passage can also appear in the page's text layer
  const chatPanel = page.locator("main > div").last();
  await chatPanel.getByText(passage, { exact: true }).click({ timeout: 60000 });
  await expect(chatPanel.getByPlaceholder("質問を入力...")).toBeVisible();

  await page.getByRole("button", { name: "チャットを隠す" }).click();
  await expect(page.getByPlaceholder("質問を入力...")).toBeHidden();
  await expect(page).toHaveURL(/\?page=1&panel=closed&selection=[A-Z0-9]+$/);

  await page.reload();

  // Still folded, with the conversation waiting behind it rather than the list
  await expect(page.getByRole("button", { name: "チャットを表示" })).toBeVisible({
    timeout: 60000,
  });
  await expect(page.getByPlaceholder("質問を入力...")).toBeHidden();

  await page.getByRole("button", { name: "チャットを表示" }).click();
  await expect(page.getByPlaceholder("質問を入力...")).toBeVisible();
  await expect(page.getByRole("button", { name: "一覧に戻る" })).toBeVisible();
});

test("dragging the splitter keeps the whole page inside the narrowed panel", async ({ page }) => {
  await openTestBook(page);
  // The outline takes a fixed 240px out of the panel; hiding it lets the page
  // use the whole width, so the drag translates directly into the PDF's size
  await page.getByRole("button", { name: "目次を隠す" }).click();

  const canvas = page.locator("canvas.block");
  await expect(canvas).toBeVisible({ timeout: 60000 });
  const widthBefore = await settledCanvasWidth(page);

  const handle = page.getByRole("separator", { name: "PDFとチャットの幅を変更" });
  const box = (await handle.boundingBox())!;
  const y = box.y + box.height / 2;
  const handleX = box.x + box.width / 2;
  // Far enough that the page runs out of width before it runs out of height:
  // a smaller drag leaves the page fitted to the pane's height and unchanged.
  const shift = 450;

  await page.mouse.move(handleX, y);
  await page.mouse.down();
  await page.mouse.move(handleX - shift, y, { steps: 20 });
  await page.mouse.up();

  const after = await drawnPageAndPane(page);
  expect(after.page.width).toBeLessThan(widthBefore - 120);
  expect(after.page.width).toBeLessThanOrEqual(after.pane.width);
  expect(after.page.height).toBeLessThanOrEqual(after.pane.height);
});

test("api health check returns ok", async ({ page }) => {
  const response = await page.request.get("/api/health");
  expect(response.status()).toBe(200);
  const json = await response.json();
  expect(json).toHaveProperty("status", "ok");
});

test("pdf upload via API (multipart) and get metadata", async ({ page }) => {
  const file = apiFixtureFile("api-upload");

  // Upload via multipart
  const response = await page.request.post("/api/pdf/open", {
    multipart: {
      file,
      fullText: "Cloudflare Workers provides serverless execution on Cloudflare's global network.",
      pageCount: String(PAGE_COUNT),
    },
  });

  expect(response.status()).toBe(200);
  const json = await response.json();
  expect(json).toHaveProperty("id");
  expect(json.fileName).toBe(file.name);
  expect(json.pageCount).toBe(PAGE_COUNT);

  // Get PDF metadata
  const getResponse = await page.request.get(`/api/pdf/${json.id}`);
  expect(getResponse.status()).toBe(200);
  const getJson = await getResponse.json();
  expect(getJson.fileName).toBe(file.name);
  expect(Array.isArray(getJson.selections)).toBe(true);

  // The viewer fetches this endpoint to render the PDF
  const fileResponse = await page.request.get(`/api/pdf/${json.id}/file`);
  expect(fileResponse.status()).toBe(200);
  expect(fileResponse.headers()["content-type"]).toBe("application/pdf");
  expect((await fileResponse.body()).length).toBe(file.buffer.length);
});

test("duplicate pdf upload returns same id", async ({ page }) => {
  const multipart = {
    file: apiFixtureFile("api-duplicate"),
    fullText: "test",
    pageCount: String(PAGE_COUNT),
  };

  const res1 = await page.request.post("/api/pdf/open", { multipart });
  const json1 = await res1.json();

  const res2 = await page.request.post("/api/pdf/open", { multipart });
  const json2 = await res2.json();

  expect(json2.id).toBe(json1.id);
});
