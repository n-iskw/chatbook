import { describe, it, expect, beforeAll } from "vitest";
import { env, applyD1Migrations, SELF } from "cloudflare:test";
import { MINIMAL_PDF_BYTES } from "./fixtures/minimalPdf";

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function computeHash(data: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

describe("POST /api/pdf/open", () => {

  it("uploads a PDF file and returns its metadata", async () => {
    const fileHash = await computeHash(MINIMAL_PDF_BYTES);
    const response = await SELF.fetch("https://example.com/api/pdf/open", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: "test.pdf",
        fileHash,
        fullText: "test content",
        pageCount: 1,
        fileContent: bytesToBase64(MINIMAL_PDF_BYTES),
      }),
    });

    expect(response.status).toBe(200);
    const json = (await response.json()) as Record<string, unknown>;
    expect(json.fileName).toBe("test.pdf");
    expect(json.pageCount).toBe(1);
    expect(json.fullText).toBe("test content");
    expect(typeof json.id).toBe("string");
  });

  it("returns 400 when required fields are missing", async () => {
    const response = await SELF.fetch("https://example.com/api/pdf/open", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(400);
  });

  it("re-opens the same file and returns the existing pdfId", async () => {
    const fileHash = await computeHash(MINIMAL_PDF_BYTES);
    const body = JSON.stringify({
      fileName: "test.pdf",
      fileHash,
      fullText: "test content",
      pageCount: 1,
      fileContent: bytesToBase64(MINIMAL_PDF_BYTES),
    });

    const response1 = await SELF.fetch("https://example.com/api/pdf/open", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    const json1 = (await response1.json()) as Record<string, unknown>;

    const response2 = await SELF.fetch("https://example.com/api/pdf/open", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    const json2 = (await response2.json()) as Record<string, unknown>;

    expect(json2.id).toBe(json1.id);
  });
});

describe("GET /api/pdf/:pdfId", () => {

  it("returns PDF metadata for a valid pdfId", async () => {
    const fileHash = await computeHash(MINIMAL_PDF_BYTES);
    const uploadResponse = await SELF.fetch("https://example.com/api/pdf/open", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: "test.pdf",
        fileHash,
        fullText: "test content",
        pageCount: 1,
        fileContent: bytesToBase64(MINIMAL_PDF_BYTES),
      }),
    });
    const uploadJson = (await uploadResponse.json()) as Record<string, unknown>;

    const response = await SELF.fetch(`https://example.com/api/pdf/${uploadJson.id}`);
    expect(response.status).toBe(200);

    const json = (await response.json()) as Record<string, unknown>;
    expect(json.fileName).toBe("test.pdf");
    expect(json.pageCount).toBe(1);
    expect(Array.isArray(json.selections)).toBe(true);
  });

  it("returns 404 for a non-existent pdfId", async () => {
    const response = await SELF.fetch("https://example.com/api/pdf/non-existent-id");
    expect(response.status).toBe(404);
  });
});
