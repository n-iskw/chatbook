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

export const activeSelectionIdAtom = atom<string | null>(null);
export const chatMessagesAtom = atom<ChatMessage[]>([]);
export const streamingContentAtom = atom<string>("");
export const isStreamingAtom = atom<boolean>(false);
// Web search is on by default: the assistant should fall back to the web when
// the document alone cannot answer the question.
export const useWebSearchAtom = atom<boolean>(true);
