import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// pdf.js needs CMap files (CID fonts, e.g. Japanese) and standard font data at
// runtime. They ship inside node_modules, which is not served to the browser,
// so copy them into public/ where Vite serves them from the site root.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "node_modules", "pdfjs-dist");
const dest = path.join(root, "public", "pdfjs");

for (const dir of ["cmaps", "standard_fonts"]) {
  await fs.rm(path.join(dest, dir), { recursive: true, force: true });
  await fs.cp(path.join(src, dir), path.join(dest, dir), { recursive: true });
}

console.log(`Copied pdf.js cmaps and standard_fonts to ${path.relative(root, dest)}`);
