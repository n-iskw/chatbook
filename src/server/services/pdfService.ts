import { ulid } from "ulid";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { pdfs, selections } from "../db/schema";

/**
 * R2 object key for a PDF, derived from its content hash.
 */
export function pdfObjectKey(fileHash: string): string {
  return `pdfs/${fileHash}.pdf`;
}

export interface PdfMetadata {
  id: string;
  fileName: string;
  pageCount: number;
  fullText: string;
}

interface OpenPdfInput {
  fileName: string;
  fileHash: string;
  fullText: string;
  pageCount: number;
  arrayBuffer: ArrayBuffer;
}

/**
 * Open (or re-open) a PDF file.
 * Text extraction is done client-side (browser pdf.js), so the server receives
 * pre-computed fileHash, fullText, and pageCount.
 * The PDF binary is stored in R2; D1 keeps the metadata and the object key.
 * Returns the existing record if a file with the same hash already exists.
 */
export async function openPdf(
  db: D1Database,
  bucket: R2Bucket,
  input: OpenPdfInput,
): Promise<PdfMetadata> {
  const { fileName, fileHash, fullText, pageCount, arrayBuffer } = input;
  const d1Db = drizzle(db);
  const objectKey = pdfObjectKey(fileHash);

  const existing = await d1Db.select().from(pdfs).where(eq(pdfs.fileHash, fileHash)).get();
  if (existing) {
    // Re-upload the binary if the object is missing (e.g. bucket was cleared).
    const head = await bucket.head(objectKey);
    if (!head) {
      await bucket.put(objectKey, arrayBuffer, {
        httpMetadata: { contentType: "application/pdf" },
      });
    }
    return {
      id: existing.id,
      fileName: existing.fileName,
      pageCount: existing.pageCount,
      fullText: existing.fullText,
    };
  }

  await bucket.put(objectKey, arrayBuffer, {
    httpMetadata: { contentType: "application/pdf" },
  });

  const id = ulid();
  const now = new Date().toISOString();

  await d1Db.insert(pdfs).values({
    id,
    filePath: objectKey,
    fileName,
    fileHash,
    fullText,
    pageCount,
    createdAt: now,
    updatedAt: now,
  });

  return { id, fileName, pageCount, fullText };
}

/**
 * Get a PDF record by id, including its selections.
 */
export async function getPdf(db: D1Database, pdfId: string) {
  const d1Db = drizzle(db);
  const pdf = await d1Db.select().from(pdfs).where(eq(pdfs.id, pdfId)).get();
  if (!pdf) return null;

  const selRows = await d1Db.select().from(selections).where(eq(selections.pdfId, pdfId)).all();

  return {
    id: pdf.id,
    fileName: pdf.fileName,
    pageCount: pdf.pageCount,
    selections: selRows.map((s) => ({
      id: s.id,
      selectedText: s.selectedText,
      pageNumber: s.pageNumber,
      positionData: JSON.parse(s.positionData),
      color: s.color,
      createdAt: s.createdAt,
    })),
  };
}
