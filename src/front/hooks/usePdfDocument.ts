// oxlint-disable-next-line no-restricted-imports -- PDF バイナリを取得して pdf.js のドキュメントを構築する初期化処理に必要
import { useState, useEffect, useRef } from "react";
import useSWRMutation from "swr/mutation";
import type * as pdfjsTypes from "pdfjs-dist";
import { pdfjsLib, PDFJS_ASSET_OPTIONS } from "../lib/pdfjsConfig";
import { renderCoverThumbnail } from "../lib/pdfLoader";
import { forgetUploadedFile, uploadedFileFor } from "../lib/uploadedFileHandoff";
import { fetcher, readRefusal } from "../lib/fetcher";
import { readOutlineEntries, toStoredOutline, type OutlineEntry } from "../lib/pdfOutline";
import {
  outlineStoredSchema,
  thumbnailStoredSchema,
  type BookDetail,
} from "../../shared/schemas/book";

/** Where a book's cover is written, and the key the write is tracked under. */
const coverKey = (pdfId: string) => `/api/pdf/${pdfId}/thumbnail`;

/** Where a book's chapters are written, and the key the write is tracked under. */
const outlineKey = (pdfId: string) => `/api/pdf/${pdfId}/outline`;

/**
 * Books opened before covers existed have no thumbnail in storage. The reader
 * already holds the rendered document, so generate the cover here and store it
 * once; otherwise those books would stay blank on the shelf forever.
 *
 * Whether the book has one is passed in rather than read here: the caller is
 * already holding the book, and asking for it again would be a second request
 * for something this app has in hand.
 */
export async function storeCoverIfMissing(
  pdfId: string,
  doc: pdfjsTypes.PDFDocumentProxy,
  hasThumbnail: boolean,
  fetchFn: typeof fetch,
  renderCover: (doc: pdfjsTypes.PDFDocumentProxy) => Promise<Blob | null> = renderCoverThumbnail,
) {
  if (hasThumbnail) return;

  try {
    const thumbnail = await renderCover(doc);
    if (!thumbnail) return;

    await fetcher(
      coverKey(pdfId),
      thumbnailStoredSchema,
      {
        method: "PUT",
        headers: { "Content-Type": "image/webp" },
        body: thumbnail,
      },
      fetchFn,
    );
  } catch (err) {
    // The same deliberate silence as rendering the cover itself: this runs
    // behind a book the reader has already opened, and a shelf falling back to
    // the title is not something to interrupt them about.
    console.warn("Failed to backfill the book cover (non-critical):", err);
  }
}

/**
 * The outline twin of storeCoverIfMissing: books stored before the outline
 * column existed leave chat on the page-window fallback, and the reader is
 * already holding the very document the chapters can be read from. A PDF that
 * ships no bookmarks writes nothing — NULL already means "use the window",
 * and the server refuses an empty outline.
 */
export async function storeOutlineIfMissing(
  pdfId: string,
  doc: pdfjsTypes.PDFDocumentProxy,
  hasOutline: boolean,
  fetchFn: typeof fetch,
  readEntries: (doc: pdfjsTypes.PDFDocumentProxy) => Promise<OutlineEntry[]> = readOutlineEntries,
) {
  if (hasOutline) return;

  try {
    const outline = toStoredOutline(await readEntries(doc));
    if (!outline) return;

    await fetcher(
      outlineKey(pdfId),
      outlineStoredSchema,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(outline),
      },
      fetchFn,
    );
  } catch (err) {
    // The same deliberate silence as the cover above: the outline only trims
    // what chat sends, and the page window keeps working without it.
    console.warn("Failed to backfill the book outline (non-critical):", err);
  }
}

/** Hands the fetched bytes to pdf.js. Injected so tests can stand in for it. */
const buildPdfDocument = (data: ArrayBuffer) =>
  pdfjsLib.getDocument({ data, ...PDFJS_ASSET_OPTIONS }).promise;

/**
 * Load the pdfjs-dist PDFDocumentProxy for the given book by fetching the
 * stored PDF binary from the API.
 *
 * The download is driven by the id alone, which the address the reader followed
 * already carries: waiting for `book` would spend a round trip — the shelf
 * entry, its highlights and the cover lookup behind it — before the bytes were
 * even asked for. `book` is only wanted afterwards, to say whether the cover
 * still has to be made.
 *
 * A book whose binary is gone, or whose bytes pdf.js will not open, used to
 * leave the viewer with no document and nothing said about it — the reader saw
 * a book that opened to a blank page. `error` is why, in the words of whoever
 * refused; the viewer is what turns it into a sentence.
 */
export function usePdfDocument(
  pdfId: string | undefined,
  book: BookDetail | undefined,
  fetchFn: typeof fetch = fetch,
  buildDocument: (data: ArrayBuffer) => Promise<pdfjsTypes.PDFDocumentProxy> = buildPdfDocument,
) {
  const [pdfDocument, setPdfDocument] = useState<pdfjsTypes.PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loadingRef = useRef<string | null>(null);

  // Storing a cover is a write, so it goes through a mutation rather than an
  // effect of its own. It is still triggered from an effect because the event
  // it answers to is pdf.js finishing the document — there is no reader action
  // behind it.
  const { trigger: backfillCover } = useSWRMutation(
    pdfId ? coverKey(pdfId) : null,
    (
      _key: string,
      {
        arg,
      }: {
        arg: { pdfId: string; doc: pdfjsTypes.PDFDocumentProxy; hasThumbnail: boolean };
      },
    ) => storeCoverIfMissing(arg.pdfId, arg.doc, arg.hasThumbnail, fetchFn),
  );

  const { trigger: backfillOutline } = useSWRMutation(
    pdfId ? outlineKey(pdfId) : null,
    (
      _key: string,
      {
        arg,
      }: {
        arg: { pdfId: string; doc: pdfjsTypes.PDFDocumentProxy; hasOutline: boolean };
      },
    ) => storeOutlineIfMissing(arg.pdfId, arg.doc, arg.hasOutline, fetchFn),
  );

  useEffect(() => {
    if (!pdfId) {
      setPdfDocument(null);
      return;
    }

    // Don't reload if already loaded for this doc id
    if (loadingRef.current === pdfId && pdfDocument) return;
    loadingRef.current = pdfId;

    // Held apart from `pdfId` so the load below keeps the narrowing this
    // early return established: it runs after the effect body has returned.
    const bookId = pdfId;
    const url = `/api/pdf/${bookId}/file`;
    let cancelled = false;
    // pdf.js runs a worker per document and only releases it when the task that
    // loaded it is destroyed, so the one built here is closed when this book is
    // left behind. Asked of the task rather than the document: pdf.js 6 took
    // `destroy` off the document itself.
    let opened: pdfjsTypes.PDFDocumentProxy | null = null;
    setError(null);

    async function loadPdf() {
      try {
        // The book the reader just uploaded is still in hand, so the bytes do
        // not have to come back down. Read again rather than kept as a buffer:
        // pdf.js detaches what it is given, and this runs twice in development.
        const justUploaded = uploadedFileFor(bookId);
        const arrayBuffer = await (async () => {
          if (justUploaded) return justUploaded.arrayBuffer();
          const response = await fetchFn(url);
          if (!response.ok) {
            const refusal = await readRefusal(url, response);
            throw new Error(refusal.message);
          }
          return response.arrayBuffer();
        })();
        if (cancelled) return;

        const doc = await buildDocument(arrayBuffer);
        opened = doc;
        if (cancelled) {
          void doc.loadingTask.destroy();
          return;
        }

        setPdfDocument(doc);
        // Only once it has been made into something the reader can look at:
        // a load cancelled halfway leaves the bytes for the next attempt.
        if (justUploaded) forgetUploadedFile(bookId);
      } catch (cause) {
        // Everything from here on is pdf.js refusing the bytes or the request
        // never arriving; both leave the reader with nothing to look at.
        console.error("Failed to load PDF for rendering:", cause);
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      }
    }

    // Errors are handled inside loadPdf; nothing here awaits it
    void loadPdf();

    return () => {
      cancelled = true;
      void opened?.loadingTask.destroy();
    };
  }, [pdfId]);

  // The cover is made from the document the reader already has open, and only
  // for books stored without one. Both halves have to be in hand, and they
  // arrive out of order — hence a step of its own rather than a line at the end
  // of the load above.
  const backfilled = useRef<string | null>(null);
  useEffect(() => {
    if (!pdfDocument || !book || book.hasThumbnail) return;
    // Once per book: the book itself is refetched while it is open, and the
    // stored cover does not show up in it until the next round trip.
    if (backfilled.current === book.id) return;
    backfilled.current = book.id;

    void backfillCover({ pdfId: book.id, doc: pdfDocument, hasThumbnail: book.hasThumbnail });
  }, [pdfDocument, book, backfillCover]);

  // The chapters, on the same footing as the cover: extracted from the open
  // document for books stored before outlines were kept, so chat moves from
  // the page window to the chapter without the book being re-added.
  const outlineBackfilled = useRef<string | null>(null);
  useEffect(() => {
    if (!pdfDocument || !book || book.hasOutline) return;
    if (outlineBackfilled.current === book.id) return;
    outlineBackfilled.current = book.id;

    void backfillOutline({ pdfId: book.id, doc: pdfDocument, hasOutline: book.hasOutline });
  }, [pdfDocument, book, backfillOutline]);

  return { pdfDocument, error };
}
