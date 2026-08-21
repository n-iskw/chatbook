import { z } from "zod";
import { selectionHighlightSchema } from "./selection";

/** A saved PDF outline entry, independent of the PDF's embedded bookmarks. */
export interface OutlineEntry {
  title: string;
  /** Null when a PDF bookmark has no resolvable destination. */
  pageNumber: number | null;
  children: OutlineEntry[];
}

export const outlineEntrySchema: z.ZodType<OutlineEntry> = z.lazy(() =>
  z.object({
    title: z.string().trim().min(1).max(300),
    pageNumber: z.number().int().positive().nullable(),
    children: z.array(outlineEntrySchema).max(100),
  }),
);

export const outlineSchema = z.array(outlineEntrySchema).max(200);

/** What the reader sends after building an outline from OCR text. */
export const saveOutlineRequestSchema = z.object({ outline: outlineSchema });

export type SaveOutlineRequest = z.infer<typeof saveOutlineRequestSchema>;

export const outlineSavedSchema = z.object({
  saved: z.literal(true),
  outline: outlineSchema,
});

/** A book as the shelf shows it. */
export const bookSummarySchema = z.object({
  id: z.string(),
  fileName: z.string(),
  pageCount: z.number().int().positive(),
  updatedAt: z.string(),
  hasThumbnail: z.boolean(),
});

export type BookSummary = z.infer<typeof bookSummarySchema>;

export const bookListSchema = z.object({ books: z.array(bookSummarySchema) });

/**
 * Where the reader left off, as every device that opens the book gets it.
 *
 * The four travel together because they were saved together: the page, the
 * chat that was open on it, and whether the outline and the chat pane sat
 * beside them. `null` for either panel is "no wide screen has said either way"
 * — narrow screens do not save them, since there the outline is a drawer and
 * the chat a sheet over the page rather than places next to it.
 */
export const readingStateSchema = z.object({
  page: z.number().int().positive(),
  selectionId: z.string().nullable(),
  outlineOpen: z.boolean().nullable(),
  chatPanelOpen: z.boolean().nullable(),
});

export type ReadingState = z.infer<typeof readingStateSchema>;

/**
 * What a device sends to save its place. The two panels are optional rather
 * than nullable: leaving them out keeps whatever was stored, which is how a
 * narrow screen saves a page without folding away what a wide screen opened.
 */
export const saveReadingStateRequestSchema = z.object({
  page: z.number().int().positive(),
  selectionId: z.string().nullable(),
  outlineOpen: z.boolean().optional(),
  chatPanelOpen: z.boolean().optional(),
});

export type SaveReadingStateRequest = z.infer<typeof saveReadingStateRequestSchema>;

export const readingStateSavedSchema = z.object({ saved: z.literal(true) });

/**
 * Limits the server holds a stored outline to. The client clamps to the same
 * numbers before sending (pdfOutline.ts の toStoredOutline) — the outline is
 * only decoration for chat, so an outline past these bounds is trimmed there
 * rather than turned into a 400 that costs the reader the whole upload.
 */
export const MAX_OUTLINE_CHAPTERS = 1000;
export const MAX_OUTLINE_TITLE_LENGTH = 500;

/**
 * One top-level chapter of the book's table of contents, as the client
 * resolved it from the PDF's outline at upload time. Entries whose
 * destination cannot be resolved to a page are dropped before sending, so
 * `pageNumber` is never null here.
 */
export const outlineChapterSchema = z.object({
  title: z.string().max(MAX_OUTLINE_TITLE_LENGTH),
  pageNumber: z.number().int().positive(),
});

export type OutlineChapter = z.infer<typeof outlineChapterSchema>;

/**
 * The stored table of contents. A book with no outline omits the field
 * entirely rather than sending an empty array — both mean the same fallback
 * (a page window around the highlight), so the distinction is not kept.
 */
export const bookOutlineSchema = z.array(outlineChapterSchema).min(1).max(MAX_OUTLINE_CHAPTERS);

export type BookOutline = z.infer<typeof bookOutlineSchema>;

/** Both the upload/backfill path and the older OCR editor write this endpoint. */
export const outlineWriteRequestSchema = z.union([saveOutlineRequestSchema, bookOutlineSchema]);

export type OutlineWriteRequest = z.infer<typeof outlineWriteRequestSchema>;

/** What opening a PDF returns: the metadata the reader needs to render it. */
export const pdfMetadataSchema = z.object({
  id: z.string(),
  fileName: z.string(),
  pageCount: z.number().int().positive(),
  fullText: z.string(),
  // Carried here too: the picker seeds the cache from this answer, and a seed
  // without the place would open an already-read book at page 1.
  readingState: readingStateSchema.nullable(),
});

export type PdfMetadata = z.infer<typeof pdfMetadataSchema>;

/** A book with the highlights made in it. */
export const bookDetailSchema = z.object({
  id: z.string(),
  fileName: z.string(),
  pageCount: z.number().int().positive(),
  hasThumbnail: z.boolean(),
  // Like hasThumbnail, this is what tells the reader whether to backfill: a
  // book stored before outlines were kept gets its chapters extracted from
  // the document the reader has open anyway (usePdfDocument).
  hasOutline: z.boolean(),
  selections: z.array(selectionHighlightSchema),
  // Optional for books created before saved outlines were introduced.
  outline: outlineSchema.optional(),
  readingState: readingStateSchema.nullable(),
});

export type BookDetail = z.infer<typeof bookDetailSchema>;

/**
 * Longest passage `/locate` will look for. A quoted passage is a sentence or
 * two; beyond this the request is not a lookup, and each one scans the whole
 * book character by character.
 */
export const MAX_LOCATE_TEXT_LENGTH = 2000;

export const locateQuerySchema = z.object({
  text: z.string().min(1).max(MAX_LOCATE_TEXT_LENGTH),
});

/**
 * Why a quoted passage has no page. Each one is a different thing to tell the
 * reader: a quote that is nowhere in the book is a sign the model reworded it,
 * while a book of one page simply has nowhere to jump to.
 */
export const pageMissSchema = z.enum(["no-quote", "not-in-book", "single-page-book"]);

export type PageMiss = z.infer<typeof pageMissSchema>;

/** Where a passage quoted from a `#:~:text=` link lives, or why it has no page. */
export const locatedPageSchema = z.discriminatedUnion("found", [
  z.object({ found: z.literal(true), pageNumber: z.number().int().positive() }),
  z.object({ found: z.literal(false), miss: pageMissSchema }),
]);

export type LocatedPage = z.infer<typeof locatedPageSchema>;

export const bookDeletedSchema = z.object({ deleted: z.literal(true) });

export const thumbnailStoredSchema = z.object({ stored: z.literal(true) });

export const outlineStoredSchema = z.object({ stored: z.literal(true) });
