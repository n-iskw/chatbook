import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const TEST_PDF = path.join(
  process.env.HOME!,
  "Documents",
  "資料",
  "本",
  "Web開発者のための［入門］Cloudflare-Workers-――JavaScript・TypeScriptの簡単・高速プラットフォーム_00.pdf",
);
const TEST_PDF_NAME = path.basename(TEST_PDF);
/** The shelf shows the file name without its extension. */
const TEST_PDF_TITLE = TEST_PDF_NAME.replace(/\.pdf$/, "");

/**
 * A book of an API test's own, as a multipart file field.
 *
 * The dev server and these tests share one D1, and a re-open overwrites the
 * stored metadata. Posting the fixture's own bytes with a placeholder fullText
 * would wipe the extracted text of the book being read in the browser, which
 * the citation and text-fragment lookups need. A trailing PDF comment keeps the
 * file valid while giving it a hash of its own, and the distinct name keeps
 * these books apart from the fixture on the shelf.
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
 * Highlights persist in D1, and they sit above the text layer to stay
 * clickable. Leftovers from earlier runs would cover the text and block
 * selection, so start every test from a book with no highlights.
 */
async function openTestBook(page: Page): Promise<string> {
  await page.goto("/");
  await page.setInputFiles('input[type="file"]', TEST_PDF);
  await expect(page.getByText("1 / 209", { exact: true })).toBeVisible({ timeout: 60000 });

  const pdfId = new URL(page.url()).pathname.split("/").pop()!;
  const { selections } = (await (await page.request.get(`/api/pdf/${pdfId}`)).json()) as {
    selections: { id: string }[];
  };
  for (const selection of selections) {
    await page.request.delete(`/api/pdf/${pdfId}/selections/${selection.id}`);
  }

  if (selections.length > 0) {
    await page.reload();
    await expect(page.getByText("1 / 209", { exact: true })).toBeVisible({ timeout: 60000 });
  }
  return pdfId;
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

test("adding a PDF from the shelf opens the reader and renders its pages", async ({ page }) => {
  const pdfPath = TEST_PDF;
  if (!fs.existsSync(pdfPath)) {
    test.skip(true, "Test PDF not found");
    return;
  }

  const fontErrors: string[] = [];
  page.on("console", (msg) => {
    const text = msg.text();
    if (text.includes("cMapUrl") || text.includes("standardFontDataUrl")) {
      fontErrors.push(text);
    }
  });

  await page.goto("/");
  await page.setInputFiles('input[type="file"]', pdfPath);

  // Uploading navigates into the reader for that book, on its first page
  await expect(page).toHaveURL(/\/books\/[A-Z0-9]+\?page=1$/, { timeout: 60000 });

  // The viewer shows the real page count from client-side extraction
  await expect(page.getByText("1 / 209", { exact: true })).toBeVisible({ timeout: 60000 });

  const canvas = page.locator("canvas.block");
  await expect(canvas).toBeVisible({ timeout: 60000 });

  // A rendered page must contain non-white pixels; a blank canvas means the
  // fonts (CMap / standard font data) failed to load.
  const inkRatio = await canvas.evaluate((el) => {
    const c = el as HTMLCanvasElement;
    const ctx = c.getContext("2d")!;
    const { data } = ctx.getImageData(0, 0, c.width, c.height);
    let ink = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] < 250 || data[i + 1] < 250 || data[i + 2] < 250) ink++;
    }
    return ink / (data.length / 4);
  });

  expect(inkRatio).toBeGreaterThan(0.001);
  expect(fontErrors).toEqual([]);
});

test("the shelf lists the book with a real cover image and opens it", async ({ page }) => {
  const pdfPath = TEST_PDF;
  if (!fs.existsSync(pdfPath)) {
    test.skip(true, "Test PDF not found");
    return;
  }

  // Make sure the book exists on the shelf (upload is idempotent by hash)
  await page.goto("/");
  await page.setInputFiles('input[type="file"]', pdfPath);
  await expect(page).toHaveURL(/\/books\//, { timeout: 60000 });

  await page.goto("/");

  // Earlier runs may have left books of the same name on the shelf, so take the
  // first match rather than requiring the title to be unique
  const cover = page.getByRole("img", { name: `${TEST_PDF_TITLE} の表紙` }).first();
  await expect(cover).toBeVisible({ timeout: 30000 });

  // The <img> must actually decode; a broken cover URL would still be "visible"
  await expect
    .poll(() => cover.evaluate((el) => (el as HTMLImageElement).naturalWidth), { timeout: 30000 })
    .toBeGreaterThan(0);

  await page.getByRole("button", { name: TEST_PDF_TITLE }).first().click();
  await expect(page).toHaveURL(/\/books\//);
  await expect(page.getByText("1 / 209", { exact: true })).toBeVisible({ timeout: 60000 });
});

test("reloading the reader keeps the book open", async ({ page }) => {
  const pdfPath = TEST_PDF;
  if (!fs.existsSync(pdfPath)) {
    test.skip(true, "Test PDF not found");
    return;
  }

  await page.goto("/");
  await page.setInputFiles('input[type="file"]', pdfPath);
  await expect(page.getByText("1 / 209", { exact: true })).toBeVisible({ timeout: 60000 });

  await page.reload();

  // Restored from the URL, not from the upload that filled the atom
  await expect(page.getByText("1 / 209", { exact: true })).toBeVisible({ timeout: 60000 });
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

/** The page number shown in the viewer's toolbar. */
async function currentPage(page: Page): Promise<number> {
  const label = await page.getByText(/^\d+ \/ 209$/).textContent();
  return Number(label!.split("/")[0].trim());
}

test("reloading resumes on the page being read", async ({ page }) => {
  if (!fs.existsSync(TEST_PDF)) {
    test.skip(true, "Test PDF not found");
    return;
  }

  await openTestBook(page);
  await page.getByRole("button", { name: "次へ" }).click();
  await page.getByRole("button", { name: "次へ" }).click();
  await expect(page.getByText("3 / 209", { exact: true })).toBeVisible();

  // The page being read is in the URL, so it survives a reload
  await expect(page).toHaveURL(/[?&]page=3/);
  await page.reload();

  await expect(page.getByText("3 / 209", { exact: true })).toBeVisible({ timeout: 60000 });
});

test("a browser text-fragment link opens the page holding the passage", async ({ page }) => {
  if (!fs.existsSync(TEST_PDF)) {
    test.skip(true, "Test PDF not found");
    return;
  }

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

  await expect(page.getByText(`${expectedPage} / 209`, { exact: true })).toBeVisible({
    timeout: 60000,
  });
});

test("dragging over the page selects text and offers to ask about it", async ({ page }) => {
  if (!fs.existsSync(TEST_PDF)) {
    test.skip(true, "Test PDF not found");
    return;
  }

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

test("the reader fits the viewport without scrolling the page", async ({ page }) => {
  if (!fs.existsSync(TEST_PDF)) {
    test.skip(true, "Test PDF not found");
    return;
  }

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
  if (!fs.existsSync(TEST_PDF)) {
    test.skip(true, "Test PDF not found");
    return;
  }

  await openTestBook(page);

  const outline = page.getByRole("navigation", { name: "目次" });
  const chapter = outline.getByRole("button", { name: /第1章 はじめてのCloudflare Workers/ });
  await expect(chapter).toBeVisible({ timeout: 30000 });

  // Nested sections are listed too
  await expect(outline.getByRole("button", { name: /1\.1 Cloudflare Workersとは/ })).toBeVisible();

  // 第1章 starts on page 11 in this book
  await chapter.click();
  await expect(page.getByText("11 / 209", { exact: true })).toBeVisible({ timeout: 10000 });

  // Nested entries resolve to their own page
  await outline.getByRole("button", { name: /1\.2 Cloudflare Workersをはじめよう/ }).click();
  await expect(page.getByText("24 / 209", { exact: true })).toBeVisible({ timeout: 10000 });
});

test("vim keys turn pages and toggle the outline by default", async ({ page }) => {
  if (!fs.existsSync(TEST_PDF)) {
    test.skip(true, "Test PDF not found");
    return;
  }

  await openTestBook(page);
  const outline = page.getByRole("navigation", { name: "目次" });
  await expect(outline).toBeVisible();

  await page.keyboard.press("j");
  await expect(page.getByText("2 / 209", { exact: true })).toBeVisible();

  await page.keyboard.press("k");
  await expect(page.getByText("1 / 209", { exact: true })).toBeVisible();

  await page.keyboard.press("t");
  await expect(outline).toBeHidden();
  await page.keyboard.press("t");
  await expect(outline).toBeVisible();

  // gg / G jump to the ends of the book
  await page.keyboard.press("Shift+G");
  await expect(page.getByText("209 / 209", { exact: true })).toBeVisible();
  await page.keyboard.press("g");
  await page.keyboard.press("g");
  await expect(page.getByText("1 / 209", { exact: true })).toBeVisible();
});

test("switching to emacs in settings changes the bindings and survives a reload", async ({
  page,
}) => {
  if (!fs.existsSync(TEST_PDF)) {
    test.skip(true, "Test PDF not found");
    return;
  }

  await openTestBook(page);

  await page.getByRole("button", { name: "設定", exact: true }).click();
  await page.getByRole("radio", { name: "Emacs" }).check();
  await page.keyboard.press("Escape");

  // The vim binding is gone...
  await page.keyboard.press("j");
  await expect(page.getByText("1 / 209", { exact: true })).toBeVisible();

  // ...and the emacs one works
  await page.keyboard.press("Control+n");
  await expect(page.getByText("2 / 209", { exact: true })).toBeVisible();

  // C-c t is a two-stroke sequence
  const outline = page.getByRole("navigation", { name: "目次" });
  await page.keyboard.press("Control+c");
  await page.keyboard.press("t");
  await expect(outline).toBeHidden();

  await page.reload();
  // The reload resumes on the page that was being read, not back at the cover
  await expect(page.getByText("2 / 209", { exact: true })).toBeVisible({ timeout: 60000 });

  await page.getByRole("button", { name: "設定", exact: true }).click();
  await expect(page.getByRole("radio", { name: "Emacs" })).toBeChecked();
});

test("typing in the chat box does not trigger shortcuts", async ({ page }) => {
  if (!fs.existsSync(TEST_PDF)) {
    test.skip(true, "Test PDF not found");
    return;
  }

  // Activate a selection so the chat input renders
  const pdfId = await openTestBook(page);
  await page.request.post(`/api/pdf/${pdfId}/selections`, {
    data: {
      selectedText: "Workers",
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

  const input = page.getByPlaceholder("質問を入力...");
  await input.click();
  await input.fill("");
  await page.keyboard.type("jkt");

  await expect(input).toHaveValue("jkt");
  await expect(page.getByText("1 / 209", { exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "目次" })).toBeVisible();
});

test("asking from the popover shows the question, a waiting state, then a streamed answer", async ({
  page,
}) => {
  if (!fs.existsSync(TEST_PDF)) {
    test.skip(true, "Test PDF not found");
    return;
  }

  await openTestBook(page);
  await goToPageWithText(page);

  // Select a line and open the question popover
  const line = page.locator(".textLayer span").first();
  const box = (await line.boundingBox())!;
  await page.mouse.move(box.x + 1, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 1, box.y + box.height / 2, { steps: 12 });
  await page.mouse.up();

  const question = "この段落を一言で要約して";
  await page.getByPlaceholder("選択した文章について質問する...").fill(question);
  await page.getByRole("button", { name: "質問する" }).click();

  // The question appears without waiting for the model
  await expect(page.getByText(question, { exact: true })).toBeVisible({ timeout: 5000 });
  // ...and the wait is visible while nothing has arrived yet
  await expect(page.getByText("考え中…")).toBeVisible({ timeout: 5000 });

  // Sample the answer while it streams: a partial render must be shorter than
  // the finished one, which cannot happen if the text lands in a single paint.
  const answer = page.locator("div.justify-start").last();
  const lengths: number[] = [];
  for (let i = 0; i < 40; i++) {
    lengths.push(((await answer.textContent()) ?? "").length);
    if (lengths.at(-1)! > 0 && (await page.getByText("考え中…").count()) === 0) {
      // keep sampling a little after the first token to catch growth
      if (lengths.filter((l) => l > 0).length > 6) break;
    }
    await page.waitForTimeout(250);
  }

  const finalLength = ((await answer.textContent()) ?? "").length;
  expect(finalLength).toBeGreaterThan(0);
  expect(lengths.some((l) => l > 0 && l < finalLength)).toBe(true);

  await expect(page.getByText("考え中…")).toBeHidden();
});

test("confirming an IME conversion with Enter does not send the question", async ({ page }) => {
  if (!fs.existsSync(TEST_PDF)) {
    test.skip(true, "Test PDF not found");
    return;
  }

  await openTestBook(page);
  await goToPageWithText(page);

  const line = page.locator(".textLayer span").first();
  const box = (await line.boundingBox())!;
  await page.mouse.move(box.x + 1, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 1, box.y + box.height / 2, { steps: 12 });
  await page.mouse.up();

  const input = page.getByPlaceholder("選択した文章について質問する...");
  await input.fill("これはなに");

  // Enter pressed while the IME is still converting only confirms the candidate
  await input.evaluate((el) => {
    el.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    el.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", isComposing: true, bubbles: true }),
    );
  });

  // The popover is still open and nothing was sent
  await expect(input).toBeVisible();
  await expect(page.getByText("考え中…")).toBeHidden();
});

test("web search is enabled by default and lives in the settings menu", async ({ page }) => {
  if (!fs.existsSync(TEST_PDF)) {
    test.skip(true, "Test PDF not found");
    return;
  }

  await openTestBook(page);

  await page.getByRole("button", { name: "設定", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "Web検索" })).toBeChecked({ timeout: 30000 });
});

test("the book title stays in the reader header instead of the chat panel", async ({ page }) => {
  if (!fs.existsSync(TEST_PDF)) {
    test.skip(true, "Test PDF not found");
    return;
  }

  const pdfId = await openTestBook(page);
  await page.request.post(`/api/pdf/${pdfId}/selections`, {
    data: {
      selectedText: "Workers",
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

  await expect(page.getByRole("banner").getByText(TEST_PDF_NAME)).toBeVisible();

  // The chat panel is for the conversation; repeating the title there only ate
  // vertical space
  const chatPanel = page.locator("main > div").last();
  await expect(chatPanel.getByPlaceholder("質問を入力...")).toBeVisible();
  await expect(chatPanel.getByText(TEST_PDF_NAME)).toBeHidden();
});

test("dragging the splitter renders the PDF at the new panel width", async ({ page }) => {
  if (!fs.existsSync(TEST_PDF)) {
    test.skip(true, "Test PDF not found");
    return;
  }

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
  const shift = 200;

  await page.mouse.move(handleX, y);
  await page.mouse.down();
  await page.mouse.move(handleX - shift, y, { steps: 20 });
  await page.mouse.up();

  expect(await settledCanvasWidth(page)).toBeLessThan(widthBefore - 150);
});

test("api health check returns ok", async ({ page }) => {
  const response = await page.request.get("/api/health");
  expect(response.status()).toBe(200);
  const json = await response.json();
  expect(json).toHaveProperty("status", "ok");
});

test("pdf upload via API (multipart) and get metadata", async ({ page }) => {
  const pdfPath = TEST_PDF;
  if (!fs.existsSync(pdfPath)) {
    test.skip(true, "Test PDF not found");
    return;
  }

  const file = apiFixtureFile("api-upload");

  // Upload via multipart
  const response = await page.request.post("/api/pdf/open", {
    multipart: {
      file,
      fullText: "Cloudflare Workers provides serverless execution on Cloudflare's global network.",
      pageCount: "209",
    },
  });

  expect(response.status()).toBe(200);
  const json = await response.json();
  expect(json).toHaveProperty("id");
  expect(json.fileName).toBe(file.name);
  expect(json.pageCount).toBe(209);

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

test("deepseek api chat integration (streaming)", async ({ page }) => {
  const pdfPath = TEST_PDF;
  if (!fs.existsSync(pdfPath)) {
    test.skip(true, "Test PDF not found");
    return;
  }

  const uploadRes = await page.request.post("/api/pdf/open", {
    multipart: {
      file: apiFixtureFile("api-chat"),
      fullText:
        "Cloudflare Workers provides serverless execution on Cloudflare's global network. Durable Objects provide consistent state management.",
      pageCount: "209",
    },
  });
  const pdf = await uploadRes.json();

  // Create a selection
  const selRes = await page.request.post(`/api/pdf/${pdf.id}/selections`, {
    data: {
      selectedText: "Durable Objects provide consistent state management",
      pageNumber: 1,
      positionData: {
        startIndex: 0,
        endIndex: 1,
        rects: [{ x: 100, y: 200, width: 300, height: 14 }],
      },
    },
  });
  expect(selRes.status()).toBe(201);
  const sel = await selRes.json();

  // Send a chat message (streaming)
  const chatResponse = await page.request.post(`/api/pdf/${pdf.id}/selections/${sel.id}/chats`, {
    data: {
      content: "What are Durable Objects?",
      useWebSearch: false,
    },
  });

  expect(chatResponse.status()).toBe(200);

  // Read SSE stream
  const body = await chatResponse.text();
  expect(body).toContain("event: token");
  expect(body).toContain("event: done");
});

test("web search chat uses responses API", async ({ page }) => {
  const pdfPath = TEST_PDF;
  if (!fs.existsSync(pdfPath)) {
    test.skip(true, "Test PDF not found");
    return;
  }

  const uploadRes = await page.request.post("/api/pdf/open", {
    multipart: {
      file: apiFixtureFile("api-websearch"),
      fullText: "Cloudflare Workers documentation.",
      pageCount: "209",
    },
  });
  const pdf = await uploadRes.json();

  // Create a selection
  const selRes = await page.request.post(`/api/pdf/${pdf.id}/selections`, {
    data: {
      selectedText: "documentation",
      pageNumber: 1,
      positionData: {
        startIndex: 0,
        endIndex: 1,
        rects: [{ x: 100, y: 200, width: 300, height: 14 }],
      },
    },
  });
  expect(selRes.status()).toBe(201);
  const sel = await selRes.json();

  // Send a chat message with web search ON
  const chatResponse = await page.request.post(`/api/pdf/${pdf.id}/selections/${sel.id}/chats`, {
    data: {
      content: "What is the latest version of React?",
      useWebSearch: true,
    },
  });

  expect(chatResponse.status()).toBe(200);

  // Read SSE stream and verify it completes
  const body = await chatResponse.text();
  expect(body).toContain("event: done");
});

test("duplicate pdf upload returns same id", async ({ page }) => {
  const pdfPath = TEST_PDF;
  if (!fs.existsSync(pdfPath)) {
    test.skip(true, "Test PDF not found");
    return;
  }

  const multipart = {
    file: apiFixtureFile("api-duplicate"),
    fullText: "test",
    pageCount: "209",
  };

  const res1 = await page.request.post("/api/pdf/open", { multipart });
  const json1 = await res1.json();

  const res2 = await page.request.post("/api/pdf/open", { multipart });
  const json2 = await res2.json();

  expect(json2.id).toBe(json1.id);
});
