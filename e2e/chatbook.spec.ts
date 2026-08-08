import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const TEST_PDF = path.join(process.env.HOME!, "Downloads", "Cloudflare Workers.pdf");

/** Upload the fixture book (idempotent by hash) and land in the reader. */
async function openTestBook(page: Page) {
  await page.goto("/");
  await page.setInputFiles('input[type="file"]', TEST_PDF);
  await expect(page.getByText("1 / 209", { exact: true })).toBeVisible({ timeout: 60000 });
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
  const pdfPath = path.join(process.env.HOME!, "Downloads", "Cloudflare Workers.pdf");
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

  // Uploading navigates into the reader for that book
  await expect(page).toHaveURL(/\/books\/[A-Z0-9]+$/, { timeout: 60000 });

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
  const pdfPath = path.join(process.env.HOME!, "Downloads", "Cloudflare Workers.pdf");
  if (!fs.existsSync(pdfPath)) {
    test.skip(true, "Test PDF not found");
    return;
  }

  // Make sure the book exists on the shelf (upload is idempotent by hash)
  await page.goto("/");
  await page.setInputFiles('input[type="file"]', pdfPath);
  await expect(page).toHaveURL(/\/books\//, { timeout: 60000 });

  await page.goto("/");

  const cover = page.getByRole("img", { name: "Cloudflare Workers の表紙" });
  await expect(cover).toBeVisible({ timeout: 30000 });

  // The <img> must actually decode; a broken cover URL would still be "visible"
  await expect
    .poll(() => cover.evaluate((el) => (el as HTMLImageElement).naturalWidth), { timeout: 30000 })
    .toBeGreaterThan(0);

  await page.getByRole("button", { name: /Cloudflare Workers/ }).click();
  await expect(page).toHaveURL(/\/books\//);
  await expect(page.getByText("1 / 209", { exact: true })).toBeVisible({ timeout: 60000 });
});

test("reloading the reader keeps the book open", async ({ page }) => {
  const pdfPath = path.join(process.env.HOME!, "Downloads", "Cloudflare Workers.pdf");
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
  const topmost = await page.evaluate(([x, y]) => {
    const el = document.elementFromPoint(x, y);
    return el?.className?.toString() ?? "";
  }, [canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height / 2] as const);
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

test("web search is enabled by default", async ({ page }) => {
  const pdfPath = path.join(process.env.HOME!, "Downloads", "Cloudflare Workers.pdf");
  if (!fs.existsSync(pdfPath)) {
    test.skip(true, "Test PDF not found");
    return;
  }

  await page.goto("/");
  await page.setInputFiles('input[type="file"]', pdfPath);
  await expect(page.getByText("1 / 209", { exact: true })).toBeVisible({ timeout: 60000 });

  // The toggle only renders once a selection is active. Create a highlight via
  // the API, then activate it by clicking it in the viewer.
  const pdfId = new URL(page.url()).pathname.split("/").pop()!;
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
  // Repeated runs stack highlights at the same spot; the last one is on top
  await page.getByRole("button", { name: "ハイライトのチャットを開く" }).last().click();

  await expect(page.getByRole("checkbox", { name: "Web検索" })).toBeChecked({ timeout: 30000 });
});

test("api health check returns ok", async ({ page }) => {
  const response = await page.request.get("/api/health");
  expect(response.status()).toBe(200);
  const json = await response.json();
  expect(json).toHaveProperty("status", "ok");
});

test("pdf upload via API (multipart) and get metadata", async ({ page }) => {
  const pdfPath = path.join(process.env.HOME!, "Downloads", "Cloudflare Workers.pdf");
  if (!fs.existsSync(pdfPath)) {
    test.skip(true, "Test PDF not found at ~/Downloads/Cloudflare Workers.pdf");
    return;
  }

  // Upload via multipart
  const response = await page.request.post("/api/pdf/open", {
    multipart: {
      file: {
        name: "Cloudflare Workers.pdf",
        mimeType: "application/pdf",
        buffer: fs.readFileSync(pdfPath),
      },
      fullText: "Cloudflare Workers provides serverless execution on Cloudflare's global network.",
      pageCount: "209",
    },
  });

  expect(response.status()).toBe(200);
  const json = await response.json();
  expect(json).toHaveProperty("id");
  expect(json.fileName).toBe("Cloudflare Workers.pdf");
  expect(json.pageCount).toBe(209);

  // Get PDF metadata
  const getResponse = await page.request.get(`/api/pdf/${json.id}`);
  expect(getResponse.status()).toBe(200);
  const getJson = await getResponse.json();
  expect(getJson.fileName).toBe("Cloudflare Workers.pdf");
  expect(Array.isArray(getJson.selections)).toBe(true);

  // The viewer fetches this endpoint to render the PDF
  const fileResponse = await page.request.get(`/api/pdf/${json.id}/file`);
  expect(fileResponse.status()).toBe(200);
  expect(fileResponse.headers()["content-type"]).toBe("application/pdf");
  expect((await fileResponse.body()).length).toBe(fs.readFileSync(pdfPath).length);
});

test("deepseek api chat integration (streaming)", async ({ page }) => {
  const pdfPath = path.join(process.env.HOME!, "Downloads", "Cloudflare Workers.pdf");
  if (!fs.existsSync(pdfPath)) {
    test.skip(true, "Test PDF not found");
    return;
  }

  const pdfBuffer = fs.readFileSync(pdfPath);

  const uploadRes = await page.request.post("/api/pdf/open", {
    multipart: {
      file: {
        name: "Cloudflare Workers.pdf",
        mimeType: "application/pdf",
        buffer: pdfBuffer,
      },
      fullText: "Cloudflare Workers provides serverless execution on Cloudflare's global network. Durable Objects provide consistent state management.",
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
  const chatResponse = await page.request.post(
    `/api/pdf/${pdf.id}/selections/${sel.id}/chats`,
    {
      data: {
        content: "What are Durable Objects?",
        useWebSearch: false,
      },
    },
  );

  expect(chatResponse.status()).toBe(200);

  // Read SSE stream
  const body = await chatResponse.text();
  expect(body).toContain("event: token");
  expect(body).toContain("event: done");
});

test("web search chat uses responses API", async ({ page }) => {
  const pdfPath = path.join(process.env.HOME!, "Downloads", "Cloudflare Workers.pdf");
  if (!fs.existsSync(pdfPath)) {
    test.skip(true, "Test PDF not found");
    return;
  }

  const pdfBuffer = fs.readFileSync(pdfPath);

  const uploadRes = await page.request.post("/api/pdf/open", {
    multipart: {
      file: {
        name: "Cloudflare Workers.pdf",
        mimeType: "application/pdf",
        buffer: pdfBuffer,
      },
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
  const chatResponse = await page.request.post(
    `/api/pdf/${pdf.id}/selections/${sel.id}/chats`,
    {
      data: {
        content: "What is the latest version of React?",
        useWebSearch: true,
      },
    },
  );

  expect(chatResponse.status()).toBe(200);

  // Read SSE stream and verify it completes
  const body = await chatResponse.text();
  expect(body).toContain("event: done");
});

test("duplicate pdf upload returns same id", async ({ page }) => {
  const pdfPath = path.join(process.env.HOME!, "Downloads", "Cloudflare Workers.pdf");
  if (!fs.existsSync(pdfPath)) {
    test.skip(true, "Test PDF not found");
    return;
  }

  const pdfBuffer = fs.readFileSync(pdfPath);

  const multipart = {
    file: {
      name: "Cloudflare Workers.pdf",
      mimeType: "application/pdf",
      buffer: pdfBuffer,
    },
    fullText: "test",
    pageCount: "209",
  };

  const res1 = await page.request.post("/api/pdf/open", { multipart });
  const json1 = await res1.json();

  const res2 = await page.request.post("/api/pdf/open", { multipart });
  const json2 = await res2.json();

  expect(json2.id).toBe(json1.id);
});
