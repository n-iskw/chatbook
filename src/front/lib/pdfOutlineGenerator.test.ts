import { describe, expect, it } from "vite-plus/test";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { generateOutlineFromPdf } from "./pdfOutlineGenerator";

function fakeDocument(pages: string[][]): PDFDocumentProxy {
  return {
    numPages: pages.length,
    getPage: async (pageNumber: number) => ({
      getTextContent: async () => ({
        items: pages[pageNumber - 1].map((str, index) => ({
          str,
          hasEOL: true,
          transform: [1, 0, 0, 1, 0, pages[pageNumber - 1].length - index],
        })),
      }),
    }),
  } as unknown as PDFDocumentProxy;
}

function fakePositionedDocument(
  pages: Array<Array<{ str: string; x: number; y: number }>>,
): PDFDocumentProxy {
  return {
    numPages: pages.length,
    getPage: async (pageNumber: number) => ({
      getTextContent: async () => ({
        items: pages[pageNumber - 1].map(({ str, x, y }) => ({
          str,
          hasEOL: true,
          transform: [1, 0, 0, 1, x, y],
        })),
      }),
    }),
  } as unknown as PDFDocumentProxy;
}

describe("generateOutlineFromPdf", () => {
  it("skips a printed contents page and points at the body headings", async () => {
    const outline = await generateOutlineFromPdf(
      fakeDocument([
        ["第1章 最初の章", "第2章 次の章"],
        ["前書き"],
        ["第1章 最初の章"],
        ["本文"],
        ["第2章 次の章"],
      ]),
    );

    expect(outline).toStrictEqual([
      { title: "第1章 最初の章", pageNumber: 3, children: [] },
      { title: "第2章 次の章", pageNumber: 5, children: [] },
    ]);
  });

  it("returns no entries when OCR text has no chapter headings", async () => {
    await expect(generateOutlineFromPdf(fakeDocument([["表紙"], ["本文"]]))).resolves.toStrictEqual(
      [],
    );
  });

  it("keeps printed contents hierarchy as nested entries", async () => {
    const outline = await generateOutlineFromPdf(
      fakePositionedDocument([
        ["表紙"].map((str) => ({ str, x: 0, y: 100 })),
        [
          { str: "第1章", x: 0, y: 200 },
          { str: "最初の章", x: 120, y: 200 },
          { str: "第2章", x: 0, y: 180 },
          { str: "次の章", x: 120, y: 180 },
        ],
        [
          { str: "目次", x: 0, y: 900 },
          { str: "第1章", x: 100, y: 800 },
          { str: "最初の章", x: 150, y: 800 },
          { str: "1", x: 520, y: 800 },
          { str: "中項目", x: 150, y: 760 },
          { str: "2", x: 520, y: 760 },
          { str: "小項目", x: 168, y: 740 },
          { str: "3", x: 520, y: 740 },
        ],
        [{ str: "第1章 最初の章", x: 0, y: 900 }],
        [{ str: "中項目 小項目", x: 0, y: 900 }],
        [{ str: "小項目", x: 0, y: 900 }],
        [{ str: "第2章 次の章", x: 0, y: 900 }],
      ]),
    );

    expect(outline[0]).toMatchObject({
      title: "第1章 最初の章",
      pageNumber: 4,
      children: [
        {
          title: "中項目",
          pageNumber: 5,
          children: [{ title: "小項目", pageNumber: 6, children: [] }],
        },
      ],
    });
  });
});
