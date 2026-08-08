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

/** Shared, so leaving a chat can stop an answer any of the panels started. */
export const chatAbortControllerAtom = atom<AbortController | null>(null);

/**
 * Stop the answer being streamed and put the chat back at rest.
 *
 * The tidy-up lives here rather than in the stream's own cleanup so that
 * starting the next answer straight after cannot be undone by the old one
 * finishing a moment later.
 */
export const abortChatStreamAtom = atom(null, (get, set) => {
  const controller = get(chatAbortControllerAtom);
  if (!controller) return;

  controller.abort();
  set(chatAbortControllerAtom, null);
  set(isStreamingAtom, false);
  set(streamingContentAtom, "");
});
