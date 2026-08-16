import type { ReactNode } from "react";
import { describe, it, expect, afterEach, vi } from "vite-plus/test";
import { renderHook } from "@testing-library/react";
import { SWRConfig, type Cache } from "swr";
import { useOpenPdfBook } from "./useOpenPdfBook";
import { bookKey } from "./useBook";
import { forgetUploadedFile, uploadedFileFor } from "../lib/uploadedFileHandoff";
import { ApiError } from "../lib/fetcher";
import type { ExtractedPdfData } from "../lib/pdfLoader";
import type { BookDetail } from "../../shared/schemas/book";

const PDF_ID = "01JBOOK";
const FILE_NAME = "Cloudflare Workers.pdf";
const PAGE_COUNT = 209;

const COVER = new Blob(["webp bytes"], { type: "image/webp" });

const FULL_TEXT = "エッジはサーバーレス実行基盤です。";

/** The place the server remembers for a book that has been read before. */
const SAVED_PLACE = {
  page: 87,
  selectionId: "01JSEL",
  outlineOpen: false,
  chatPanelOpen: false,
};

function extraction(thumbnail: Blob | null): ExtractedPdfData {
  return {
    fileName: FILE_NAME,
    fileHash: "sha256-of-the-file",
    fullText: FULL_TEXT,
    pageCount: PAGE_COUNT,
    fileContentBase64: "",
    thumbnail,
  };
}

/** Answers the upload the way the API does, and records what it was sent. */
function uploadStub({
  refuse = false,
  readingState = SAVED_PLACE,
}: { refuse?: boolean; readingState?: BookDetail["readingState"] } = {}) {
  const uploads: { url: string; method: string }[] = [];
  const fetchFn = (url: string, init?: RequestInit) => {
    uploads.push({ url, method: init?.method ?? "GET" });
    if (refuse) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            error: { code: "PDF_EXTRACT_FAILED", message: "Failed to process PDF" },
          }),
          { status: 500, headers: { "Content-Type": "application/json" } },
        ),
      );
    }
    const body = {
      id: PDF_ID,
      fileName: FILE_NAME,
      pageCount: PAGE_COUNT,
      fullText: FULL_TEXT,
      readingState,
    };
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
  };
  return { uploads, fetchFn };
}

async function openAPdf(
  thumbnail: Blob | null,
  {
    refuse = false,
    readingState = SAVED_PLACE,
  }: { refuse?: boolean; readingState?: BookDetail["readingState"] } = {},
) {
  const { uploads, fetchFn } = uploadStub({ refuse, readingState });
  vi.stubGlobal("fetch", fetchFn);

  // The cache is built here rather than inside the provider so the test can
  // read what the upload filed in it.
  const cache: Cache = new Map();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <SWRConfig value={{ provider: () => cache }}>{children}</SWRConfig>
  );

  const { result } = renderHook(() => useOpenPdfBook(async () => extraction(thumbnail)), {
    wrapper,
  });

  const chosen = new File(["%PDF-1.7"], FILE_NAME, { type: "application/pdf" });
  const outcome = await result.current(chosen);

  return { cache, uploads, outcome, chosen };
}

describe("useOpenPdfBook", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    // Module state, like the SWR cache: it would carry into the next test.
    forgetUploadedFile(PDF_ID);
  });

  it("files the uploaded book, with the place it was left at, under the key the reader opens it by", async () => {
    // The seed is what the reader opens: dropping the place here would send a
    // book that was read on another device back to page 1.
    const { cache, outcome } = await openAPdf(COVER);

    expect(outcome._unsafeUnwrap()).toBe(PDF_ID);
    expect(cache.get(bookKey(PDF_ID))?.data).toStrictEqual({
      id: PDF_ID,
      fileName: FILE_NAME,
      pageCount: PAGE_COUNT,
      hasThumbnail: true,
      selections: [],
      readingState: SAVED_PLACE,
    } satisfies BookDetail);
  });

  it("records that a book whose cover could not be rendered has none", async () => {
    const { cache, outcome } = await openAPdf(null, { readingState: null });

    expect(outcome._unsafeUnwrap()).toBe(PDF_ID);
    expect(cache.get(bookKey(PDF_ID))?.data).toStrictEqual({
      id: PDF_ID,
      fileName: FILE_NAME,
      pageCount: PAGE_COUNT,
      hasThumbnail: false,
      selections: [],
      readingState: null,
    } satisfies BookDetail);
  });

  it("hands back the reason an upload was refused rather than swallowing it", async () => {
    // The failure used to reach console.error only, so choosing a file the
    // server rejected looked exactly like choosing no file at all.
    const { cache, outcome } = await openAPdf(COVER, { refuse: true });

    const refusal = outcome._unsafeUnwrapErr();
    expect(refusal).toBeInstanceOf(ApiError);
    expect({
      message: refusal.message,
      code: (refusal as ApiError).code,
      status: (refusal as ApiError).status,
      kind: (refusal as ApiError).kind,
    }).toStrictEqual({
      message: "Failed to process PDF",
      code: "PDF_EXTRACT_FAILED",
      status: 500,
      kind: "http",
    });
    expect(cache.get(bookKey(PDF_ID))).toBeUndefined();
  });

  it("sends the chosen file to the endpoint that stores books", async () => {
    const { uploads } = await openAPdf(COVER);

    expect(uploads).toStrictEqual([{ url: "/api/pdf/open", method: "POST" }]);
  });

  it("leaves the chosen file for the viewer so the book is not fetched back", async () => {
    // The bytes have just gone up. Without this the viewer asks for the same
    // book again, which on a phone is the upload's cost paid a second time.
    const { chosen, outcome } = await openAPdf(COVER);

    expect(outcome._unsafeUnwrap()).toBe(PDF_ID);
    expect(uploadedFileFor(PDF_ID)).toBe(chosen);
  });

  it("leaves nothing behind when the upload was refused", async () => {
    // There is no book to open, so the next one opened must not be handed the
    // bytes of a file that was never stored.
    await openAPdf(COVER, { refuse: true });

    expect(uploadedFileFor(PDF_ID)).toBeNull();
  });
});
