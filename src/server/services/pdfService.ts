import { ulid } from "ulid";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { pdfs, selections } from "../db/schema";
import fs from "node:fs/promises";

const PDFS_DIR = ".data/pdfs";

async function ensureDir(dir: string) {
  // Create directories step by step to handle Worker fs quirks
  const parts = dir.split("/").filter(Boolean);
  let current = "";
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    try {
      await fs.mkdir(current);
    } catch {
      // directory may already exist
    }
  }
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
 * Text extraction is done client-side (browser pdf.js), so server receives
 * pre-computed fileHash, fullText, and pageCount.
 * Returns the existing record if a file with the same hash already exists.
 */
export async function openPdf(db: D1Database, input: OpenPdfInput): Promise<PdfMetadata> {
  const { fileName, fileHash, fullText, pageCount, arrayBuffer } = input;

  // Check if already opened
  const existing = await drizzle(db).select().from(pdfs).where(eq(pdfs.fileHash, fileHash)).get();
  if (existing) {
    return {
      id: existing.id,
      fileName: existing.fileName,
      pageCount: existing.pageCount,
      fullText: existing.fullText,
    };
  }

  // Save file to disk (best-effort, non-critical)
  const filePath = `${PDFS_DIR}/${fileHash}.pdf`;
  try {
    await ensureDir(PDFS_DIR);
    await fs.writeFile(filePath, new Uint8Array(arrayBuffer));
  } catch (err) {
    console.warn("Failed to save PDF file to disk (non-critical):", err);
  }

  // Store in D1
  const id = ulid();
  const now = new Date().toISOString();
  const d1Db = drizzle(db);

  await d1Db.insert(pdfs).values({
    id,
    filePath,
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
