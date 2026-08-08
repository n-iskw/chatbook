import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

/**
 * E2E Test: chatbook core flow
 *
 * Tests:
 * 1. App loads and shows initial state
 * 2. PDF upload via API
 * 3. Health check
 */

test("app loads and shows initial UI", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("text=chatbook")).toBeVisible();
  await expect(page.locator("text=PDFファイルを選択してください")).toBeVisible();
});

test("api health check returns ok", async ({ page }) => {
  const response = await page.request.get("/api/health");
  expect(response.status()).toBe(200);
  const json = await response.json();
  expect(json).toHaveProperty("status", "ok");
});

test("pdf upload via API and get metadata", async ({ page }) => {
  // Read test PDF
  const pdfPath = path.join(process.env.HOME!, "Downloads", "Cloudflare Workers.pdf");
  let pdfBuffer: Buffer;
  try {
    pdfBuffer = fs.readFileSync(pdfPath);
  } catch {
    test.skip(true, "Test PDF not found at ~/Downloads/Cloudflare Workers.pdf");
    return;
  }

  const fileHash = crypto.createHash("sha256").update(pdfBuffer).digest("hex");
  const fileContent = pdfBuffer.toString("base64");

  // Upload via API
  const response = await page.request.post("/api/pdf/open", {
    data: {
      fileName: "Cloudflare Workers.pdf",
      fileHash,
      fullText: "test full text",
      pageCount: 16,
      fileContent,
    },
  });

  expect(response.status()).toBe(200);
  const json = await response.json();
  expect(json).toHaveProperty("id");
  expect(json.fileName).toBe("Cloudflare Workers.pdf");
  expect(json.pageCount).toBe(16);

  // Get PDF metadata
  const getResponse = await page.request.get(`/api/pdf/${json.id}`);
  expect(getResponse.status()).toBe(200);
  const getJson = await getResponse.json();
  expect(getJson.fileName).toBe("Cloudflare Workers.pdf");
  expect(Array.isArray(getJson.selections)).toBe(true);
});

test("deepseek api chat integration (streaming)", async ({ page }) => {
  // First upload a PDF
  const pdfPath = path.join(process.env.HOME!, "Downloads", "Cloudflare Workers.pdf");
  let pdfBuffer: Buffer;
  try {
    pdfBuffer = fs.readFileSync(pdfPath);
  } catch {
    test.skip(true, "Test PDF not found");
    return;
  }

  const fileHash = crypto.createHash("sha256").update(pdfBuffer).digest("hex");
  const fileContent = pdfBuffer.toString("base64");

  const uploadRes = await page.request.post("/api/pdf/open", {
    data: {
      fileName: "Cloudflare Workers.pdf",
      fileHash,
      fullText: "Cloudflare Workers provides serverless execution on Cloudflare's global network. Durable Objects provide consistent state management.",
      pageCount: 16,
      fileContent,
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

test("duplicate pdf upload returns same id", async ({ page }) => {
  const pdfPath = path.join(process.env.HOME!, "Downloads", "Cloudflare Workers.pdf");
  let pdfBuffer: Buffer;
  try {
    pdfBuffer = fs.readFileSync(pdfPath);
  } catch {
    test.skip(true, "Test PDF not found");
    return;
  }

  const fileHash = crypto.createHash("sha256").update(pdfBuffer).digest("hex");
  const fileContent = pdfBuffer.toString("base64");

  const data = {
    fileName: "Cloudflare Workers.pdf",
    fileHash,
    fullText: "test",
    pageCount: 16,
    fileContent,
  };

  const res1 = await page.request.post("/api/pdf/open", { data });
  const json1 = await res1.json();

  const res2 = await page.request.post("/api/pdf/open", { data });
  const json2 = await res2.json();

  expect(json2.id).toBe(json1.id);
});
