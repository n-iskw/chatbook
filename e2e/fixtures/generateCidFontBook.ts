/**
 * Draws `cid-font-book.pdf`, the book that proves `cMapUrl` still reaches pdf.js.
 *
 *     node e2e/fixtures/generateCidFontBook.ts
 *
 * `test-book.pdf` cannot serve here: pdfkit embeds every glyph it draws, so
 * pdf.js reads that file without a predefined CMap and the test would pass with
 * `cMapUrl` removed. A book from a publisher sets its Type0 font's `/Encoding`
 * to a predefined CMap (`UniJIS-UCS2-H` here) instead, which pdf.js can only
 * resolve by fetching the CMap tables — both to draw the glyphs and to read the
 * text out. That shape is what this file reproduces, so the suite no longer
 * needs a real book sitting on the machine that runs it.
 *
 * The PDF is written by hand rather than through pdfkit, which always embeds a
 * subset and offers no way to name a predefined CMap. Its bytes are fixed, so a
 * re-run leaves no diff.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT = path.join(here, "cid-font-book.pdf");

/**
 * Japanese only. Latin letters would survive as glyphs even when the CMap is
 * missing, which would let a page that failed to read its CMap still look drawn.
 */
const LINES = ["日本語の見本", "外字表を読めない時は白紙になる"];

const FONT_SIZE = 24;
const LINE_STEP = 40;
const FIRST_BASELINE = 720;
const LEFT_MARGIN = 72;

/**
 * `UniJIS-UCS2-H` maps two-byte UCS-2 codes to Adobe-Japan1 CIDs, so the string
 * operand is the text in UTF-16BE.
 */
function ucs2Hex(text: string): string {
  return Buffer.from(text, "utf16le").swap16().toString("hex");
}

function contentStream(): string {
  const shown = LINES.map((line, i) => {
    const y = FIRST_BASELINE - i * LINE_STEP;
    return `1 0 0 1 ${LEFT_MARGIN} ${y} Tm <${ucs2Hex(line)}> Tj`;
  }).join("\n");
  return `BT\n/F1 ${FONT_SIZE} Tf\n${shown}\nET\n`;
}

/**
 * The font is not embedded, so pdf.js falls back to a system face for the
 * glyphs. The CMap is still required to learn which glyph each code means.
 */
const objects: string[] = [
  "<< /Type /Catalog /Pages 2 0 R >>",
  "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
  "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] " +
    "/Resources << /Font << /F1 4 0 R >> >> /Contents 6 0 R >>",
  "<< /Type /Font /Subtype /Type0 /BaseFont /KozMinPr6N-Regular " +
    "/Encoding /UniJIS-UCS2-H /DescendantFonts [5 0 R] >>",
  "<< /Type /Font /Subtype /CIDFontType0 /BaseFont /KozMinPr6N-Regular " +
    "/CIDSystemInfo << /Registry (Adobe) /Ordering (Japan1) /Supplement 6 >> " +
    "/FontDescriptor 7 0 R /DW 1000 >>",
  `<< /Length ${Buffer.byteLength(contentStream())} >>\nstream\n${contentStream()}endstream`,
  "<< /Type /FontDescriptor /FontName /KozMinPr6N-Regular /Flags 4 " +
    "/FontBBox [-437 -340 1147 1317] /ItalicAngle 0 /Ascent 1317 /Descent -349 " +
    "/CapHeight 742 /StemV 80 >>",
];

function build(): Buffer {
  const chunks: string[] = ["%PDF-1.7\n"];
  const offsets: number[] = [];
  let offset = chunks[0].length;

  objects.forEach((body, i) => {
    offsets.push(offset);
    const chunk = `${i + 1} 0 obj\n${body}\nendobj\n`;
    chunks.push(chunk);
    offset += Buffer.byteLength(chunk);
  });

  // The cross-reference table's entries are 20 bytes each, the free head first.
  const entries = ["0000000000 65535 f \n"].concat(
    offsets.map((at) => `${String(at).padStart(10, "0")} 00000 n \n`),
  );
  const size = objects.length + 1;
  chunks.push(`xref\n0 ${size}\n${entries.join("")}`);
  chunks.push(`trailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF\n`);

  return Buffer.from(chunks.join(""), "binary");
}

fs.writeFileSync(OUTPUT, build());
console.log(`${OUTPUT} (${fs.statSync(OUTPUT).size} bytes)`);
