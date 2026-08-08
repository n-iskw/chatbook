import { atom } from "jotai";

export interface PdfDoc {
  id: string;
  fileName: string;
  pageCount: number;
}

export type PdfStatus = "idle" | "loading" | "ready" | "error";

export const pdfDocAtom = atom<PdfDoc | null>(null);
export const pdfStatusAtom = atom<PdfStatus>("idle");
export const pdfErrorAtom = atom<string | null>(null);
export const currentPageAtom = atom<number>(1);
/** Rendered page size, plus the page's intrinsic width at scale 1. */
export const pageViewportAtom = atom<{ width: number; height: number; baseWidth: number }>({
  width: 800,
  height: 1000,
  baseWidth: 800,
});

/** Shared by the toolbar toggle and the keyboard shortcut. */
export const outlineOpenAtom = atom<boolean>(true);
