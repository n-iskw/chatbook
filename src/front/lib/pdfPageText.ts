import type { PDFDocumentProxy } from "pdfjs-dist";

/** Extract the text layer for one displayed page, preserving explicit line breaks. */
export async function extractPdfPageText(
  pdfDocument: PDFDocumentProxy,
  pageNumber: number,
): Promise<string> {
  const page = await pdfDocument.getPage(pageNumber);
  const content = await page.getTextContent();
  const text = content.items
    .map((item) => {
      if (!("str" in item)) return "";
      return `${item.str}${"hasEOL" in item && item.hasEOL ? "\n" : " "}`;
    })
    .join("");

  return text
    .replace(/[ \t]+/gu, " ")
    .replace(/ *\n */gu, "\n")
    .trim();
}
