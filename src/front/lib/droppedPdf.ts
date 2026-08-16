/**
 * What a drop on the shelf turned out to be carrying.
 *
 * `none` and `refused` are kept apart because they are different events to the
 * reader: dragging a text selection over the shelf carries no files at all and
 * is not a mistake, while dropping a photo is one and has to say so.
 */
export type DroppedPdf =
  | { kind: "pdf"; file: File }
  | { kind: "refused"; reason: string }
  | { kind: "none" };

/** Whether the browser, or failing that the name, calls this a PDF. */
function isPdf(file: File): boolean {
  // Some file managers hand over a drop with no type at all, so the extension
  // is the fallback rather than the other way round.
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

/** Picks the single book out of a drop, or says why there is none to open. */
export function pickDroppedPdf(files: readonly File[]): DroppedPdf {
  if (files.length === 0) return { kind: "none" };
  // One at a time: the shelf leaves for the book it just took in, so a second
  // file would have nowhere to be opened.
  if (files.length > 1) return { kind: "refused", reason: "一度に追加できるPDFは1冊です" };

  const [file] = files;
  if (!isPdf(file)) return { kind: "refused", reason: "PDFファイルだけを追加できます" };
  return { kind: "pdf", file };
}
