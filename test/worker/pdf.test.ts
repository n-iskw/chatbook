import { describe, it, expect, beforeAll } from "vitest";
import { env, applyD1Migrations, SELF } from "cloudflare:test";
import { MINIMAL_PDF_BYTES } from "./fixtures/minimalPdf";

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

/**
 * PDFs are de-duplicated by content hash, so tests that need their own book
 * must upload distinct bytes. Appending a PDF comment keeps the file valid.
 */
function uniquePdfBytes(tag: string): Uint8Array {
  const suffix = new TextEncoder().encode(`\n%${tag}\n`);
  const bytes = new Uint8Array(MINIMAL_PDF_BYTES.length + suffix.length);
  bytes.set(MINIMAL_PDF_BYTES, 0);
  bytes.set(suffix, MINIMAL_PDF_BYTES.length);
  return bytes;
}

async function uploadBook(options: {
  tag: string;
  fileName: string;
  thumbnail?: Blob;
}): Promise<{ id: string }> {
  const formData = new FormData();
  formData.append(
    "file",
    new File([uniquePdfBytes(options.tag)], options.fileName, { type: "application/pdf" }),
  );
  formData.append("fullText", "text");
  formData.append("pageCount", "1");
  if (options.thumbnail) {
    formData.append(
      "thumbnail",
      new File([options.thumbnail], "cover.webp", { type: "image/webp" }),
    );
  }

  const response = await SELF.fetch("https://example.com/api/pdf/open", {
    method: "POST",
    body: formData,
  });
  return (await response.json()) as { id: string };
}

/** Shape returned by the PDF endpoints the tests assert on. */
interface PdfResponse {
  id: string;
  fileName: string;
  pageCount: number;
  fullText: string;
  hasThumbnail?: boolean;
  selections?: unknown[];
}

const FAKE_WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x00, 0x57, 0x45, 0x42, 0x50]);

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
    const json = (await response.json()) as PdfResponse;
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

  it("refreshes stored metadata when the same file is re-opened with new extraction results", async () => {
    const staleForm = new FormData();
    staleForm.append(
      "file",
      new File([MINIMAL_PDF_BYTES], "stale.pdf", { type: "application/pdf" }),
    );
    staleForm.append("fullText", "stale text");
    staleForm.append("pageCount", "16");

    const staleResponse = await SELF.fetch("https://example.com/api/pdf/open", {
      method: "POST",
      body: staleForm,
    });
    const stale = (await staleResponse.json()) as PdfResponse;

    const freshForm = new FormData();
    freshForm.append(
      "file",
      new File([MINIMAL_PDF_BYTES], "fresh.pdf", { type: "application/pdf" }),
    );
    freshForm.append("fullText", "fresh text");
    freshForm.append("pageCount", "209");

    const freshResponse = await SELF.fetch("https://example.com/api/pdf/open", {
      method: "POST",
      body: freshForm,
    });
    const fresh = (await freshResponse.json()) as PdfResponse;

    expect(fresh.id).toBe(stale.id);
    expect(fresh.pageCount).toBe(209);
    expect(fresh.fullText).toBe("fresh text");
    expect(fresh.fileName).toBe("fresh.pdf");

    // The refreshed values must be persisted, not just echoed back
    const getResponse = await SELF.fetch(`https://example.com/api/pdf/${fresh.id}`);
    const persisted = (await getResponse.json()) as PdfResponse;
    expect(persisted.pageCount).toBe(209);
    expect(persisted.fileName).toBe("fresh.pdf");
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
    const json1 = (await response1.json()) as PdfResponse;

    // New FormData for second request (FormData is consumed after fetch)
    const formData2 = new FormData();
    formData2.append(
      "file",
      new File([MINIMAL_PDF_BYTES], "test.pdf", { type: "application/pdf" }),
    );
    formData2.append("fullText", "test content");
    formData2.append("pageCount", "1");

    const response2 = await SELF.fetch("https://example.com/api/pdf/open", {
      method: "POST",
      body: formData2,
    });
    const json2 = (await response2.json()) as PdfResponse;

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
    const uploadJson = (await uploadResponse.json()) as PdfResponse;

    const response = await SELF.fetch(`https://example.com/api/pdf/${uploadJson.id}`);
    expect(response.status).toBe(200);

    const json = (await response.json()) as PdfResponse;
    expect(json.fileName).toBe("test.pdf");
    expect(json.pageCount).toBe(1);
    expect(Array.isArray(json.selections)).toBe(true);
  });

  it("returns 404 for a non-existent pdfId", async () => {
    const response = await SELF.fetch("https://example.com/api/pdf/non-existent-id");
    expect(response.status).toBe(404);
  });
});

describe("GET /api/pdf/:pdfId/file", () => {
  it("serves the stored PDF binary for rendering", async () => {
    const formData = new FormData();
    formData.append("file", new File([MINIMAL_PDF_BYTES], "test.pdf", { type: "application/pdf" }));
    formData.append("fullText", "test content");
    formData.append("pageCount", "1");

    const uploadResponse = await SELF.fetch("https://example.com/api/pdf/open", {
      method: "POST",
      body: formData,
    });
    const uploadJson = (await uploadResponse.json()) as PdfResponse;

    const response = await SELF.fetch(`https://example.com/api/pdf/${uploadJson.id}/file`);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(bytes).toEqual(MINIMAL_PDF_BYTES);
  });

  it("returns 404 for a non-existent pdfId", async () => {
    const response = await SELF.fetch("https://example.com/api/pdf/non-existent-id/file");
    expect(response.status).toBe(404);
  });
});

describe("GET /api/pdfs", () => {
  it("lists uploaded books with their thumbnail availability", async () => {
    const withCover = await uploadBook({
      tag: "shelf-with-cover",
      fileName: "with-cover.pdf",
      thumbnail: new Blob([FAKE_WEBP], { type: "image/webp" }),
    });
    const withoutCover = await uploadBook({
      tag: "shelf-without-cover",
      fileName: "without-cover.pdf",
    });

    const response = await SELF.fetch("https://example.com/api/pdfs");
    expect(response.status).toBe(200);

    const { books } = (await response.json()) as {
      books: { id: string; fileName: string; pageCount: number; hasThumbnail: boolean }[];
    };

    const covered = books.find((b) => b.id === withCover.id);
    const uncovered = books.find((b) => b.id === withoutCover.id);

    expect(covered).toEqual({
      id: withCover.id,
      fileName: "with-cover.pdf",
      pageCount: 1,
      updatedAt: expect.any(String),
      hasThumbnail: true,
    });
    expect(uncovered?.hasThumbnail).toBe(false);
  });
});

describe("PDF thumbnails", () => {
  it("serves the thumbnail uploaded alongside the PDF", async () => {
    const book = await uploadBook({
      tag: "thumb-served",
      fileName: "cover.pdf",
      thumbnail: new Blob([FAKE_WEBP], { type: "image/webp" }),
    });

    const response = await SELF.fetch(`https://example.com/api/pdf/${book.id}/thumbnail`);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/webp");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(FAKE_WEBP);
  });

  it("returns 404 when the book has no thumbnail yet", async () => {
    const book = await uploadBook({ tag: "thumb-missing", fileName: "no-cover.pdf" });

    const response = await SELF.fetch(`https://example.com/api/pdf/${book.id}/thumbnail`);

    expect(response.status).toBe(404);
  });

  it("stores a thumbnail uploaded later via PUT", async () => {
    const book = await uploadBook({ tag: "thumb-backfill", fileName: "backfill.pdf" });

    const putResponse = await SELF.fetch(`https://example.com/api/pdf/${book.id}/thumbnail`, {
      method: "PUT",
      headers: { "Content-Type": "image/webp" },
      body: FAKE_WEBP,
    });
    expect(putResponse.status).toBe(200);

    const getResponse = await SELF.fetch(`https://example.com/api/pdf/${book.id}/thumbnail`);
    expect(getResponse.status).toBe(200);
    expect(new Uint8Array(await getResponse.arrayBuffer())).toEqual(FAKE_WEBP);
  });

  it("returns 404 when putting a thumbnail for an unknown book", async () => {
    const response = await SELF.fetch("https://example.com/api/pdf/does-not-exist/thumbnail", {
      method: "PUT",
      headers: { "Content-Type": "image/webp" },
      body: FAKE_WEBP,
    });

    expect(response.status).toBe(404);
  });
});
