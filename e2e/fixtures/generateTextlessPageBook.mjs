import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";

const here = path.dirname(fileURLToPath(import.meta.url));
const output = path.join(here, "textless-page-book.pdf");

const document = new PDFDocument({
  size: "A4",
  autoFirstPage: false,
  info: { CreationDate: new Date(Date.UTC(2026, 0, 1)) },
});
const stream = fs.createWriteStream(output);
document.pipe(stream);

document.addPage();
document.fontSize(24).text("A page with selectable text", 72, 120);
document.addPage();
// Deliberately leave this page without text. It represents a scanned image
// page whose PDF has no OCR layer.

await new Promise((resolve, reject) => {
  stream.on("finish", resolve);
  stream.on("error", reject);
  document.end();
});

console.log(`${output} (${fs.statSync(output).size} bytes)`);
