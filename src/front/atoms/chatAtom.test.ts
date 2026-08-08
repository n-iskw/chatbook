import { describe, it, expect } from "vite-plus/test";
import { createStore } from "jotai";
import {
  abortChatStreamAtom,
  chatAbortControllerAtom,
  isStreamingAtom,
  streamingContentAtom,
} from "./chatAtom";

describe("abortChatStreamAtom", () => {
  it("stops the running answer and clears what it was drawing", () => {
    const store = createStore();
    const controller = new AbortController();
    store.set(chatAbortControllerAtom, controller);
    store.set(isStreamingAtom, true);
    store.set(streamingContentAtom, "Durable Objects は");

    store.set(abortChatStreamAtom);

    expect(controller.signal.aborted).toBe(true);
    expect(store.get(chatAbortControllerAtom)).toBeNull();
    expect(store.get(isStreamingAtom)).toBe(false);
    expect(store.get(streamingContentAtom)).toBe("");
  });

  it("leaves the chat untouched when the answer it stopped is already gone", () => {
    const store = createStore();
    const controller = new AbortController();
    store.set(chatAbortControllerAtom, controller);
    store.set(streamingContentAtom, "Durable Objects は");

    store.set(abortChatStreamAtom);
    expect(controller.signal.aborted).toBe(true);
    expect(store.get(streamingContentAtom)).toBe("");

    // What the chat shows next is no longer the stopped answer's to clear
    store.set(streamingContentAtom, "次の回答の書き出し");
    store.set(abortChatStreamAtom);

    expect(store.get(streamingContentAtom)).toBe("次の回答の書き出し");
  });
});
