import { Hono } from "hono";
import { z } from "zod";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import fs from "node:fs/promises";
import { pdfs } from "../db/schema";
import { openPdf, getPdf } from "../services/pdfService";

type Env = {
  Bindings: {
    DB: D1Database;
  };
};

const openPdfSchema = z.object({
  fileName: z.string().min(1),
  fileHash: z.string().min(1),
  fullText: z.string(),
  pageCount: z.number().int().positive(),
  fileContent: z.string().min(1), // base64 encoded PDF
});

export const pdfRoute = new Hono<Env>()
  .post("/pdf/open", async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body) {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "Invalid JSON body" } }, 400);
    }

    const parsed = openPdfSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Invalid input" } },
        400,
      );
    }

    const { fileName, fileHash, fullText, pageCount, fileContent } = parsed.data;

    // Decode base64 file content
    let arrayBuffer: ArrayBuffer;
    try {
      const binaryString = atob(fileContent);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      arrayBuffer = bytes.buffer;
    } catch {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "Invalid base64 file content" } }, 400);
    }

    try {
      const metadata = await openPdf(c.env.DB, { fileName, fileHash, fullText, pageCount, arrayBuffer });
      return c.json(metadata);
    } catch (err) {
      console.error("PDF open error:", err);
      return c.json(
        { error: { code: "PDF_EXTRACT_FAILED", message: "Failed to process PDF" } },
        500,
      );
    }
  })
  .get("/pdf/:pdfId/file", async (c) => {
    const pdfId = c.req.param("pdfId");
    const d1Db = drizzle(c.env.DB);
    const pdf = await d1Db.select().from(pdfs).where(eq(pdfs.id, pdfId)).get();
    if (!pdf) {
      return c.json({ error: { code: "PDF_NOT_FOUND", message: "PDF not found" } }, 404);
    }

    // Read file from disk
    try {
      const fileData = await fs.readFile(pdf.filePath);
      return new Response(fileData, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="${pdf.fileName}"`,
        },
      });
    } catch {
      return c.json({ error: { code: "PDF_FILE_MISSING", message: "PDF file not found on disk" } }, 404);
    }
  })
  .get("/pdf/:pdfId", async (c) => {
    const pdfId = c.req.param("pdfId");
    const result = await getPdf(c.env.DB, pdfId);

    if (!result) {
      return c.json({ error: { code: "PDF_NOT_FOUND", message: "PDF not found" } }, 404);
    }

    return c.json(result);
  });
