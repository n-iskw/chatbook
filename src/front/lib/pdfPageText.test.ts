import { describe, expect, it } from "vitest";
import { extractPdfPageText } from "./pdfPageText";

describe("extractPdfPageText", () => {
  it("preserves line breaks from the PDF text layer", async () => {
    const document = {
      getPage: async () => ({
        getTextContent: async () => ({
          items: [{ str: "第一行", hasEOL: true }, { str: "第二" }, { str: "行", hasEOL: true }],
        }),
      }),
    } as never;

    await expect(extractPdfPageText(document, 5)).resolves.toBe("第一行\n第二 行");
  });
});
