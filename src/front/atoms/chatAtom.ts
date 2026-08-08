import { atom } from "jotai";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  createdAt: string;
}

export interface Citation {
  id: string;
  type: "pdf" | "web";
  text: string;
  pageNumber?: number;
  url?: string;
}

/** The highlighted passage the current conversation is about. */
export interface ActiveSelection {
  id: string;
  selectedText: string;
  pageNumber: number;
}

/** A highlight of the open book, as the viewer draws it and the list shows it. */
export interface SelectionHighlight {
  id: string;
  selectedText: string;
  pageNumber: number;
  positionData: {
    rects: { x: number; y: number; width: number; height: number }[];
    pageWidth?: number;
  };
  color: string;
  createdAt: string;
}

export const activeSelectionAtom = atom<ActiveSelection | null>(null);
// Shared so the chat panel can list the same highlights the viewer draws.
export const selectionsAtom = atom<SelectionHighlight[]>([]);
export const chatMessagesAtom = atom<ChatMessage[]>([]);
export const streamingContentAtom = atom<string>("");
export const isStreamingAtom = atom<boolean>(false);
// Web search is on by default: the assistant should fall back to the web when
// the document alone cannot answer the question.
export const useWebSearchAtom = atom<boolean>(true);
