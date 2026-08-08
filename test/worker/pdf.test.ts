import { describe, it, expect, beforeAll } from "vitest";
import { env, applyD1Migrations, SELF } from "cloudflare:test";
import { MINIMAL_PDF_BYTES } from "./fixtures/minimalPdf";

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

describe("POST /api/pdf/open", () => {
  it("uploads a PDF file and returns its metadata", async () => {
    const formData = new FormData();
    formData.append("file", new File([MINIMAL_PDF_BYTES], "test.pdf", { type: "application/pdf" }));
    formData.append("fullText", "test content");
    formData.append("pageCount", "1");

    const response = await SELF.fetch("https://example.com/api/pdf/open", {
      method: "POST",
      body: formData,
    });

    expect(response.status).toBe(200);
    const json = (await response.json()) as Record<string, unknown>;
    expect(json.fileName).toBe("test.pdf");
    expect(json.pageCount).toBe(1);
    expect(json.fullText).toBe("test content");
    expect(typeof json.id).toBe("string");
  });

  it("returns 400 when no file is provided", async () => {
    const formData = new FormData();
    formData.append("fullText", "test");
    formData.append("pageCount", "1");

    const response = await SELF.fetch("https://example.com/api/pdf/open", {
      method: "POST",
      body: formData,
    });

    expect(response.status).toBe(400);
  });

  it("re-opens the same file and returns the existing pdfId", async () => {
    const formData = new FormData();
    formData.append("file", new File([MINIMAL_PDF_BYTES], "test.pdf", { type: "application/pdf" }));
    formData.append("fullText", "test content");
    formData.append("pageCount", "1");

    const response1 = await SELF.fetch("https://example.com/api/pdf/open", {
      method: "POST",
      body: formData,
    });
    const json1 = (await response1.json()) as Record<string, unknown>;

    // New FormData for second request (FormData is consumed after fetch)
    const formData2 = new FormData();
    formData2.append("file", new File([MINIMAL_PDF_BYTES], "test.pdf", { type: "application/pdf" }));
    formData2.append("fullText", "test content");
    formData2.append("pageCount", "1");

    const response2 = await SELF.fetch("https://example.com/api/pdf/open", {
      method: "POST",
      body: formData2,
    });
    const json2 = (await response2.json()) as Record<string, unknown>;

    expect(json2.id).toBe(json1.id);
  });
});

describe("GET /api/pdf/:pdfId", () => {
  it("returns PDF metadata for a valid pdfId", async () => {
    const formData = new FormData();
    formData.append("file", new File([MINIMAL_PDF_BYTES], "test.pdf", { type: "application/pdf" }));
    formData.append("fullText", "test content");
    formData.append("pageCount", "1");

    const uploadResponse = await SELF.fetch("https://example.com/api/pdf/open", {
      method: "POST",
      body: formData,
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
