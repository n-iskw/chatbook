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
export const pdfScaleAtom = atom<number>(1.5);
export const pageViewportAtom = atom<{ width: number; height: number }>({ width: 800, height: 1000 });

/** Shared by the toolbar toggle and the keyboard shortcut. */
export const outlineOpenAtom = atom<boolean>(true);
