import { test, expect, type Page } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FIXTURE_FILE_NAME, OUTLINE, PAGE_COUNT } from "./fixtures/testBookManifest.ts";

/**
 * The reader on a screen with room for one column.
 *
 * Everything here is about what the width changes: the panes folding into a
 * page with a toolbar under it, and the gestures that replace a pointer. What
 * both layouts share — opening a book, drawing it, following a citation — is
 * covered once, against the panes, in `chatbook.spec.ts`.
 *
 * Not covered here: the pinch. Playwright drives one finger, and a gesture
 * needing two cannot be sent at all; `src/front/lib/touchNavigation.test.ts`
 * holds the arithmetic instead.
 */

const TEST_PDF = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  FIXTURE_FILE_NAME,
);

function pageLabel(pageNumber: number): string {
  return `${pageNumber} / ${PAGE_COUNT}`;
}

/** Upload the fixture book and land in the reader, with no highlights on it. */
/**
 * Sign in, so the rest of the run can reach the API.
 *
 * The credentials are the ones `.dev.vars` carries for local development; the
 * deployed app has a password of its own that never appears here.
 */
async function logIn(page: Page): Promise<void> {
  const response = await page.request.post("/api/auth/login", {
    data: { username: "skanehira", password: "skanehira" },
  });
  expect(response.status()).toBe(200);
}

async function openTestBook(page: Page): Promise<string> {
  await logIn(page);
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

/** The pane the page is drawn and scrolled in. */
function pagePane(page: Page) {
  return page.locator("main .overflow-auto").first();
}

test("opens a book as one column, with the page controls under it", async ({ page }) => {
  await openTestBook(page);

  await expect(page.getByRole("navigation", { name: "ページ操作" })).toBeVisible();
  // The splitter sizes a second pane, and there is none
  await expect(page.getByRole("separator")).toHaveCount(0);
  // The page is drawn across the full width rather than shrunk to fit beside
  // something: it fills the window bar the pane's own padding.
  const pane = (await pagePane(page).boundingBox())!;
  const canvas = (await page.locator("main canvas").first().boundingBox())!;
  expect(canvas.width).toBeGreaterThan(pane.width - 40);
});

test("turns the page on a tap at the edge, and leaves the middle alone", async ({ page }) => {
  await openTestBook(page);
  const pane = (await pagePane(page).boundingBox())!;
  const middleY = pane.y + pane.height / 2;

  await page.touchscreen.tap(pane.x + pane.width * 0.9, middleY);
  await expect(page.getByText(pageLabel(2), { exact: true })).toBeVisible();

  await page.touchscreen.tap(pane.x + pane.width * 0.1, middleY);
  await expect(page.getByText(pageLabel(1), { exact: true })).toBeVisible();

  // The middle belongs to the double tap that zooms, so one tap there does
  // nothing rather than turning the page under the reader's finger.
  await page.touchscreen.tap(pane.x + pane.width * 0.5, middleY);
  await expect(page.getByText(pageLabel(1), { exact: true })).toBeVisible();
});

test("brings the outline over the page, and jumps from it", async ({ page }) => {
  await openTestBook(page);
  const chapter = OUTLINE.find((entry) => entry.page > 1)!;

  await page.getByRole("button", { name: "目次", exact: true }).tap();
  await expect(page.getByRole("button", { name: "目次を閉じる" })).toBeVisible();

  await page.getByRole("button", { name: new RegExp(`^${chapter.title}`) }).tap();

  await expect(page.getByText(pageLabel(chapter.page), { exact: true })).toBeVisible();
  // Jumping is also leaving: the drawer covers the page it just moved to
  await expect(page.getByRole("button", { name: "目次を閉じる" })).toHaveCount(0);
});

test("raises the chat from the toolbar without taking the page turn away", async ({ page }) => {
  await openTestBook(page);

  await page.getByRole("button", { name: "チャット" }).tap();

  await expect(page.getByRole("region", { name: "チャット" })).toBeVisible();
  // The sheet stops above the toolbar, so reading on is still possible while
  // an answer is up — which is the point of having both on screen.
  await page.getByRole("button", { name: "次のページ" }).tap();
  await expect(page.getByText(pageLabel(2), { exact: true })).toBeVisible();
});

test("offers to ask about a passage, and puts the question box up on request", async ({ page }) => {
  await openTestBook(page);

  // A drag over a line is what a long press settles into; the viewer reads it
  // from the browser announcing the selection rather than from a mouse button.
  const line = page.locator(".textLayer span").first();
  const box = (await line.boundingBox())!;
  await page.mouse.move(box.x + 1, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 1, box.y + box.height / 2, { steps: 12 });
  await page.mouse.up();

  const ask = page.getByRole("button", { name: "AIに質問" });
  await expect(ask).toBeVisible({ timeout: 10000 });
  // The passage is quoted back, where a selection off by a word shows up
  // before a highlight is stored from it
  const selected = await page.evaluate(() => window.getSelection()?.toString() ?? "");
  expect(selected.trim().length).toBeGreaterThan(0);

  // The keyboard only arrives once the offer is taken
  await expect(page.getByPlaceholder("選択した文章について質問する...")).toHaveCount(0);
  await ask.tap();
  await expect(page.getByPlaceholder("選択した文章について質問する...")).toBeVisible();
});

test("keeps the shelf shut until the password is typed", async ({ page }) => {
  // The whole reason this is deployed behind a login: the URL is public, and
  // what is behind it — the books, and the API key the answers cost — is not.
  const refused = await page.request.get("/api/pdfs", { failOnStatusCode: false });
  expect(refused.status()).toBe(401);

  await page.goto("/");
  await expect(page.getByLabel("パスワード")).toBeVisible();

  await page.getByLabel("ユーザー名").fill("skanehira");
  await page.getByLabel("パスワード").fill("skanehira");
  await page.getByRole("button", { name: "ログイン" }).tap();

  // Signed in, and still at the address that was asked for
  await expect(page.getByRole("button", { name: "PDFを追加" })).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/");
});
