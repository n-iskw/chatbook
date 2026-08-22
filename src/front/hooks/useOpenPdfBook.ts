import { useSWRConfig } from "swr";
import { ResultAsync } from "neverthrow";
import { extractPdfData, type ExtractedPdfData } from "../lib/pdfLoader";
import { postWithProgress } from "../lib/fetcher";
import { bookKey } from "./useBook";
import { rememberUploadedFile } from "../lib/uploadedFileHandoff";
import { pdfMetadataSchema, type BookDetail } from "../../shared/schemas/book";

/** Whatever was thrown, as something with a `message` the reader can be shown. */
const asError = (cause: unknown) => (cause instanceof Error ? cause : new Error(String(cause)));
const SHELF_KEY = "/api/pdfs";

/** Turns a file the reader chose into a stored book, and hands back its id. */
export type OpenPdfBook = (file: File) => ResultAsync<string, Error>;

/**
 * Reads a chosen PDF, stores it, and seeds the cache the reader opens it from.
 *
 * A hook rather than a plain function because the last step writes to the SWR
 * cache. The reason a file did not become a book comes back in the value:
 * whoever called this is an event handler, the end of the line for a rejected
 * promise — not even the route's errorElement would catch one — and the reader
 * would be left with a picker that appeared to do nothing.
 */
export function useOpenPdfBook(
  extract: (file: File) => Promise<ExtractedPdfData> = extractPdfData,
  onProgress: (ratio: number) => void = () => {},
  createRequest?: () => XMLHttpRequest,
): OpenPdfBook {
  const { mutate } = useSWRConfig();

  return (file: File) =>
    // Reading the file is pdf.js' job and can fail on its own (a file that is
    // not really a PDF), so it is part of the same result as the upload.
    ResultAsync.fromPromise(extract(file), asError)
      .andThen((extracted) => {
        // Send as multipart/form-data (avoids base64 overhead)
        const formData = new FormData();
        formData.append("file", file);
        formData.append("fullText", extracted.fullText);
        formData.append("pageCount", String(extracted.pageCount));
        if (extracted.thumbnail) {
          formData.append("thumbnail", extracted.thumbnail, "cover.webp");
        }
        // Absent rather than empty when there is none: the server refuses an
        // empty outline, and NULL is what sends chat to its page window.
        if (extracted.outline) {
          formData.append("outline", JSON.stringify(extracted.outline));
        }

        // Sent with progress rather than through `resultFetcher`: a book is
        // large enough that the reader has to see it moving (22MB over a
        // phone's connection is around a minute).
        return postWithProgress(
          "/api/pdf/open",
          pdfMetadataSchema,
          formData,
          onProgress,
          createRequest,
        ).map((result) => ({
          result,
          hasThumbnail: extracted.thumbnail !== null,
          hasOutline: extracted.outline !== null,
        }));
      })
      .andThen(({ result, hasThumbnail, hasOutline }) => {
        // The upload already answered with everything the reader needs to open
        // the book, so hand it to the cache the reader reads from. Without this
        // the reader would show an empty viewer while it asked for the very
        // thing that was just sent.
        //
        // The highlight list starts empty because the upload does not report
        // one. Opening a book that was annotated before therefore shows its
        // highlights a moment late, when the reader's own read of the book
        // lands on top of this entry.
        const book: BookDetail = {
          id: result.id,
          fileName: result.fileName,
          pageCount: result.pageCount,
          hasThumbnail,
          // The upload this answers for stored the outline in the same
          // request, so the seed can say so without asking the server — and
          // must, or the reader's backfill would re-send it on arrival.
          hasOutline,
          selections: [],
          // The place travels with the upload's answer, so a book that was read
          // on another device opens where it was left rather than at page 1.
          readingState: result.readingState,
        };
        // The same reasoning as the cache seed, for the bytes rather than the
        // book: the viewer this navigates to would otherwise ask the API for
        // the very file that has just gone up, which over a phone's connection
        // costs the upload all over again.
        rememberUploadedFile(result.id, file);

        return ResultAsync.fromPromise(
          mutate(bookKey(result.id), book, { revalidate: false }),
          asError,
        ).map(() => {
          // The shelf was already mounted when the file was chosen, so its
          // cached empty list must be revalidated before the reader's shelf
          // tab is opened. Do not make navigation wait for a second request;
          // the reader also has the uploaded book cache as an immediate
          // fallback while this refresh is in flight.
          void mutate(SHELF_KEY);
          return result.id;
        });
      });
}
