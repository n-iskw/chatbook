/**
 * Draws `test-book.pdf`, the book the E2E suite uploads.
 *
 * Run it after changing `testBookManifest.ts`; the PDF itself is committed so
 * the suite needs neither this script nor its font to run:
 *
 *     node e2e/fixtures/generateTestBook.ts
 *
 * The output is byte-for-byte reproducible (the creation date is fixed, and
 * pdfkit derives the file ID from it), so a re-run leaves no diff unless the
 * manifest changed.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";
import {
  BODY_LINES_PER_PAGE,
  COVER_SUBTITLE,
  COVER_TITLE,
  FIGURE_PAGE,
  FIXTURE_FILE_NAME,
  OUTLINE,
  PAGE_COUNT,
  pageText,
} from "./testBookManifest.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT = path.join(here, FIXTURE_FILE_NAME);
const FONT_CACHE = path.join(here, ".cache", "NotoSansCJKjp-Regular.otf");
const FONT_URL =
  "https://raw.githubusercontent.com/notofonts/noto-cjk/Sans2.004/Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf";

/** A fixed date, so the file ID and the XMP metadata do not change per run. */
const CREATED_AT = new Date(Date.UTC(2026, 0, 1));

const MARGIN = 72;
const TEXT_WIDTH = 451;
const HEADING_SIZE = 18;
const BODY_SIZE = 12;
const BODY_TOP = 130;
const BODY_STEP = 26;

async function japaneseFont(): Promise<string> {
  if (!fs.existsSync(FONT_CACHE)) {
    fs.mkdirSync(path.dirname(FONT_CACHE), { recursive: true });
    const response = await fetch(FONT_URL);
    if (!response.ok) throw new Error(`downloading the font failed: ${response.status}`);
    fs.writeFileSync(FONT_CACHE, Buffer.from(await response.arrayBuffer()));
  }
  return FONT_CACHE;
}

function drawLine(doc: PDFKit.PDFDocument, text: string, y: number) {
  doc.text(text, MARGIN, y, { width: TEXT_WIDTH, lineBreak: false });
}

function drawCover(doc: PDFKit.PDFDocument) {
  doc.addPage();
  doc.rect(0, 0, doc.page.width, 220).fill("#1f2937");
  doc.fillColor("#ffffff").font("jp").fontSize(28);
  drawLine(doc, COVER_TITLE, 90);
  doc.fontSize(14);
  drawLine(doc, COVER_SUBTITLE, 140);
}

function drawContentPage(doc: PDFKit.PDFDocument, pageNumber: number) {
  const { heading, body } = pageText(pageNumber);
  doc.addPage();
  doc.fillColor("#000000").font("jp").fontSize(HEADING_SIZE);
  drawLine(doc, heading, MARGIN);
  doc.fontSize(BODY_SIZE);

  if (pageNumber !== FIGURE_PAGE) {
    body.forEach((line, i) => drawLine(doc, line, BODY_TOP + i * BODY_STEP));
    return;
  }

  // Two lines of body text, a figure, then its caption. The caption is what a
  // drag that runs past the end of a line would wrongly reach.
  body.slice(0, 2).forEach((line, i) => drawLine(doc, line, BODY_TOP + i * BODY_STEP));
  doc.rect(MARGIN, 210, TEXT_WIDTH, 260).fill("#d1d5db");
  doc.fillColor("#000000");
  body.slice(2, BODY_LINES_PER_PAGE).forEach((line, i) => drawLine(doc, line, 500 + i * BODY_STEP));
}

/**
 * Add the outline entries that point at the page now being drawn.
 *
 * pdfkit aims an item at whichever page is current, so entries are added while
 * walking the book rather than all at once. A chapter is always reached before
 * its sections, so its item is there to hang them off.
 */
const chapterItems = new Map<string, PDFKit.PDFOutline>();
function addOutlineFor(pageNumber: number) {
  for (const chapter of OUTLINE) {
    if (chapter.page === pageNumber) {
      chapterItems.set(chapter.title, doc.outline.addItem(chapter.title));
    }
    for (const section of chapter.children) {
      if (section.page === pageNumber) {
        chapterItems.get(chapter.title)!.addItem(section.title);
      }
    }
  }
}

// The creation date goes through the constructor because pdfkit derives the
// file ID from `info` there; setting it afterwards leaves the ID random.
const doc = new PDFDocument({
  size: "A4",
  margin: MARGIN,
  autoFirstPage: false,
  info: { CreationDate: CREATED_AT },
});
doc.registerFont("jp", await japaneseFont());

const written = new Promise<void>((resolve, reject) => {
  const stream = fs.createWriteStream(OUTPUT);
  stream.on("finish", () => resolve());
  stream.on("error", reject);
  doc.pipe(stream);
});

for (let pageNumber = 1; pageNumber <= PAGE_COUNT; pageNumber++) {
  if (pageNumber === 1) drawCover(doc);
  else drawContentPage(doc, pageNumber);
  addOutlineFor(pageNumber);
}

doc.end();
await written;
console.log(`${OUTPUT} (${PAGE_COUNT} pages, ${fs.statSync(OUTPUT).size} bytes)`);
