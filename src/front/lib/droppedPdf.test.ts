import { describe, it, expect } from "vite-plus/test";
import { pickDroppedPdf } from "./droppedPdf";

const pdf = (name = "Cloudflare Workers.pdf", type = "application/pdf") =>
  new File(["%PDF-1.7"], name, { type });

describe("pickDroppedPdf", () => {
  it("hands back the one PDF that was dropped", () => {
    const file = pdf();

    expect(pickDroppedPdf([file])).toStrictEqual({ kind: "pdf", file });
  });

  it("takes a PDF the browser named no type for", () => {
    // Which is what a drop from some file managers looks like: the extension is
    // all there is to go on, and refusing it would refuse a real book.
    const file = pdf("Rust 入門.pdf", "");

    expect(pickDroppedPdf([file])).toStrictEqual({ kind: "pdf", file });
  });

  it("refuses a drop of several files", () => {
    expect(pickDroppedPdf([pdf("a.pdf"), pdf("b.pdf")])).toStrictEqual({
      kind: "refused",
      reason: "一度に追加できるPDFは1冊です",
    });
  });

  it("refuses a file that is not a PDF", () => {
    expect(pickDroppedPdf([new File(["gif"], "cat.gif", { type: "image/gif" })])).toStrictEqual({
      kind: "refused",
      reason: "PDFファイルだけを追加できます",
    });
  });

  it("reports nothing to add when the drop carries no files", () => {
    // Dragging selected text over the shelf is a drop with nothing in it, and
    // has no business colouring the shelf red.
    expect(pickDroppedPdf([])).toStrictEqual({ kind: "none" });
  });
});
