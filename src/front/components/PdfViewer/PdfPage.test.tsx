import { describe, it, expect } from "vite-plus/test";
import { render, waitFor } from "@testing-library/react";
import { Provider, createStore } from "jotai";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { PdfPage } from "./PdfPage";

/** A document that refuses the page asked of it, as a damaged file would. */
const DAMAGED_DOC = {
  getPage: () => Promise.reject(new Error("Invalid page request")),
} as unknown as PDFDocumentProxy;

describe("PdfPage", () => {
  it("hands the failure up to its caller when the page cannot be drawn", async () => {
    // The failure used to reach console.error only, so the reader was left
    // looking at an empty page frame with the page counter still on it. The
    // page it happened on comes with it: a spread has two of these drawing at
    // once, and the message names the one the reader cannot see.
    const reported: { page: number; message: string }[] = [];

    render(
      <Provider store={createStore()}>
        <PdfPage
          pdfDoc={DAMAGED_DOC}
          pageNumber={3}
          containerWidth={600}
          containerHeight={800}
          zoom={1}
          onError={(page, message) => reported.push({ page, message })}
        />
      </Provider>,
    );

    await waitFor(() =>
      expect(reported).toStrictEqual([{ page: 3, message: "Invalid page request" }]),
    );
  });
});
