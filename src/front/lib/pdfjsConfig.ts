/**
 * The `legacy` build, not the default one.
 *
 * pdf.js writes its own source against the newest JavaScript it can, and 5.7
 * calls `Map.prototype.getOrInsertComputed` — a method Chrome only shipped
 * recently. A phone a version or two behind throws
 * `getOrInsertComputed is not a function` the moment a page is drawn, while the
 * same code renders fine on a desktop that updated last week.
 *
 * The `legacy` build is pdf.js' own answer to that: the same library with
 * core-js polyfills folded in. It costs bundle size, which for a reader that
 * already ships a PDF engine is not the constraint worth optimising.
 *
 * Both halves have to be the legacy build. The worker parses the document in a
 * scope of its own, where a polyfill installed on the main thread does not
 * reach it.
 */
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/legacy/build/pdf.worker.mjs",
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
