import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.mjs",
  import.meta.url,
).toString();

/**
 * Asset URLs pdf.js needs at runtime. Without cMapUrl, CID-keyed fonts
 * (Japanese and other CJK documents) fail to load and pages render blank.
 * These directories are copied into public/ by scripts/copy-pdfjs-assets.mjs.
 */
export const PDFJS_ASSET_OPTIONS = {
  cMapUrl: "/pdfjs/cmaps/",
  cMapPacked: true,
  standardFontDataUrl: "/pdfjs/standard_fonts/",
} as const;

export { pdfjsLib };
