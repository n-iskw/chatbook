import { describe, it, expect } from "vite-plus/test";
import { renderHook, act, waitFor } from "@testing-library/react";
import { Provider, createStore } from "jotai";
import type { ReactNode } from "react";
import { useChatStream } from "./useChatStream";
import {
  abortChatStreamAtom,
  chatAbortControllerAtom,
  chatMessagesAtom,
  isStreamingAtom,
  streamingContentAtom,
} from "../atoms/chatAtom";

const QUESTION = "Durable Objects とは?";

function tokenEvent(content: string): string {
  return `event: token\ndata: ${JSON.stringify({ content })}\n\n`;
}

function doneEvent(messageId: string): string {
  return `event: done\ndata: ${JSON.stringify({ messageId })}\n\n`;
}

interface ChatCall {
  url: string;
  body: unknown;
  emit: (sse: string) => void;
  end: () => void;
}

/** A chat endpoint the test feeds by hand, and that gives up when aborted. */
function streamingFetchStub() {
  const encoder = new TextEncoder();
  const calls: ChatCall[] = [];

  const fetchFn: typeof fetch = (input, init) => {
    if (typeof input !== "string" || typeof init?.body !== "string") {
      throw new Error("the chat endpoint is called with a url and a JSON body");
    }

    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        controller = c;
      },
    });
    calls.push({
      url: input,
      body: JSON.parse(init.body) as unknown,
      emit: (sse) => controller.enqueue(encoder.encode(sse)),
      end: () => controller.close(),
    });
    init?.signal?.addEventListener("abort", () => {
      controller.error(new DOMException("The operation was aborted.", "AbortError"));
    });
    return Promise.resolve(new Response(body, { status: 200 }));
  };

  return { fetchFn, calls };
}

function renderChatStream(fetchFn: typeof fetch) {
  const store = createStore();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
  return { store, view: renderHook(() => useChatStream(fetchFn), { wrapper }) };
}

describe("useChatStream", () => {
  it("adds the finished answer to the conversation and releases the stream", async () => {
    const { fetchFn, calls } = streamingFetchStub();
    const { store, view } = renderChatStream(fetchFn);

    let sent!: Promise<void>;
    await act(async () => {
      sent = view.result.current.sendMessage("p1", "s1", QUESTION, false);
    });
    await act(async () => {
      calls[0].emit(tokenEvent("単一の"));
      calls[0].emit(tokenEvent("インスタンスです"));
      calls[0].emit(doneEvent("m1"));
      calls[0].end();
      await sent;
    });

    expect(calls.map((call) => [call.url, call.body])).toEqual([
      ["/api/pdf/p1/selections/s1/chats", { content: QUESTION, useWebSearch: false }],
    ]);
    expect(store.get(chatMessagesAtom).map((m) => [m.role, m.content])).toEqual([
      ["user", QUESTION],
      ["assistant", "単一のインスタンスです"],
    ]);
    expect(store.get(streamingContentAtom)).toBe("");
    expect(store.get(isStreamingAtom)).toBe(false);
    expect(store.get(chatAbortControllerAtom)).toBeNull();
  });

  it("keeps a half-written answer out of the conversation when the chat is left", async () => {
    const { fetchFn, calls } = streamingFetchStub();
    const { store, view } = renderChatStream(fetchFn);
    const errors: Error[] = [];

    let sent!: Promise<void>;
    await act(async () => {
      sent = view.result.current.sendMessage("p1", "s1", QUESTION, false, {
        onError: (err) => errors.push(err),
      });
    });
    await act(async () => {
      calls[0].emit(tokenEvent("単一の"));
    });
    await waitFor(() => expect(store.get(streamingContentAtom)).toBe("単一の"));

    await act(async () => {
      store.set(abortChatStreamAtom);
      await sent;
    });

    expect(store.get(chatMessagesAtom).map((m) => [m.role, m.content])).toEqual([
      ["user", QUESTION],
    ]);
    expect(store.get(streamingContentAtom)).toBe("");
    expect(store.get(isStreamingAtom)).toBe(false);
    expect(errors).toEqual([]);
  });

  it("drops the answer still streaming when the next question is asked", async () => {
    const { fetchFn, calls } = streamingFetchStub();
    const { store, view } = renderChatStream(fetchFn);

    let firstSent!: Promise<void>;
    await act(async () => {
      firstSent = view.result.current.sendMessage("p1", "s1", "最初の質問", false);
    });
    await act(async () => {
      calls[0].emit(tokenEvent("途中まで"));
    });
    await waitFor(() => expect(store.get(streamingContentAtom)).toBe("途中まで"));

    let secondSent!: Promise<void>;
    await act(async () => {
      secondSent = view.result.current.sendMessage("p1", "s1", "次の質問", false);
    });
    await act(async () => {
      calls[1].emit(tokenEvent("こちらが答えです"));
      calls[1].emit(doneEvent("m2"));
      calls[1].end();
      await secondSent;
      await firstSent;
    });

    expect(store.get(chatMessagesAtom).map((m) => [m.role, m.content])).toEqual([
      ["user", "最初の質問"],
      ["user", "次の質問"],
      ["assistant", "こちらが答えです"],
    ]);
    expect(store.get(isStreamingAtom)).toBe(false);
    expect(store.get(chatAbortControllerAtom)).toBeNull();
  });
});
