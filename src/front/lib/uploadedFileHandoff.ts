/**
 * The bytes of the book that was just uploaded, on their way to the viewer.
 *
 * Uploading already sends the whole PDF up; the viewer it navigates to then
 * asks the API for the same bytes back, so a 22MB book costs 22MB up and 22MB
 * down over a phone's connection. The file the reader chose is still in hand,
 * so it is left here for the viewer to pick up instead.
 *
 * A `File` rather than the bytes: pdf.js detaches the buffer it is given, and a
 * `File` can be read again — which the viewer needs, because React runs the
 * load twice in development.
 *
 * One slot, not a map. Holding two books at once is tens of megabytes of a
 * phone's memory spent on a book the reader has already left, and only the
 * book being opened right now can be the one just uploaded.
 */
let handed: { pdfId: string; file: File } | null = null;

/** Leaves the uploaded file for the viewer of that book to pick up. */
export function rememberUploadedFile(pdfId: string, file: File): void {
  handed = { pdfId, file };
}

/** The file waiting for this book, or null when it has to be fetched. */
export function uploadedFileFor(pdfId: string): File | null {
  return handed?.pdfId === pdfId ? handed.file : null;
}

/** Drops the held file, once the viewer has built its document from it. */
export function forgetUploadedFile(pdfId: string): void {
  if (handed?.pdfId === pdfId) handed = null;
}
