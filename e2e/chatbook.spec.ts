import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

test("app loads and shows initial UI", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("text=chatbook")).toBeVisible();
  await expect(page.locator("text=PDFファイルを選択してください")).toBeVisible();
});

test("opening a PDF through the UI renders its pages", async ({ page }) => {
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

  // The viewer shows the real page count from client-side extraction
  await expect(page.getByText("1 / 209", { exact: true })).toBeVisible({ timeout: 60000 });

  const canvas = page.locator("canvas");
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
