import { describe, it, expect, afterEach } from "vite-plus/test";
import { rememberUploadedFile, uploadedFileFor, forgetUploadedFile } from "./uploadedFileHandoff";

const A_PDF = (name = "book.pdf") => new File(["%PDF-1.7"], name, { type: "application/pdf" });

describe("uploadedFileHandoff", () => {
  afterEach(() => {
    forgetUploadedFile("book-1");
    forgetUploadedFile("book-2");
  });

  it("hands the viewer the file the reader just uploaded for that book", () => {
    const file = A_PDF();

    rememberUploadedFile("book-1", file);

    expect(uploadedFileFor("book-1")).toBe(file);
  });

  it("hands nothing over for a book the reader opened from the shelf", () => {
    // Which is every book but the one just uploaded: those have to be fetched.
    rememberUploadedFile("book-1", A_PDF());

    expect(uploadedFileFor("book-2")).toBeNull();
  });

  it("keeps only the most recent upload", () => {
    // One slot: two books' bytes held at once is tens of megabytes of a phone's
    // memory for a book the reader has already left.
    const second = A_PDF("second.pdf");
    rememberUploadedFile("book-1", A_PDF());

    rememberUploadedFile("book-2", second);

    expect(uploadedFileFor("book-2")).toBe(second);
    expect(uploadedFileFor("book-1")).toBeNull();
  });

  it("lets go of the file once the viewer has taken it", () => {
    rememberUploadedFile("book-1", A_PDF());

    forgetUploadedFile("book-1");

    expect(uploadedFileFor("book-1")).toBeNull();
  });

  it("leaves the held file alone when another book is let go of", () => {
    // The viewer that finished with an older book must not drop the bytes of
    // the one being opened now.
    const file = A_PDF();
    rememberUploadedFile("book-1", file);

    forgetUploadedFile("book-2");

    expect(uploadedFileFor("book-1")).toBe(file);
  });
});
