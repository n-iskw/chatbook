import { useCallback } from "react";
import { useAtom } from "jotai";
import {
  chatMessagesAtom,
  streamingContentAtom,
  isStreamingAtom,
  type ChatMessage,
  type Citation,
} from "../atoms/chatAtom";
import { createSseParser } from "../lib/sseParser";

interface ChatStreamOptions {
  onCitation?: (citation: Citation) => void;
  onDone?: (messageId: string) => void;
  onError?: (error: Error) => void;
}

/**
 * Send a question and render the answer as it streams in.
 */
export function useChatStream() {
  const [, setMessages] = useAtom(chatMessagesAtom);
  const [, setStreamingContent] = useAtom(streamingContentAtom);
  const [, setIsStreaming] = useAtom(isStreamingAtom);

  const sendMessage = useCallback(
    async (
      pdfId: string,
      selectionId: string,
      content: string,
      useWebSearch: boolean,
      options: ChatStreamOptions = {},
    ) => {
      // Show the question straight away, before the model has answered
      const userMsg: ChatMessage = {
        id: `temp-${Date.now()}`,
        role: "user",
        content,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setStreamingContent("");
      setIsStreaming(true);

      try {
        const response = await fetch(`/api/pdf/${pdfId}/selections/${selectionId}/chats`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content, useWebSearch }),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        const parse = createSseParser();
        let fullContent = "";
        const citations: Citation[] = [];
        let messageId = "";
        let streamError: Error | null = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          for (const { event, data } of parse(decoder.decode(value, { stream: true }))) {
            switch (event) {
              case "token": {
                const { content: token } = data as { content?: string };
                if (token) {
                  fullContent += token;
                  setStreamingContent(fullContent);
                }
                break;
              }
              case "citation": {
                const citation = data as Citation;
                citations.push(citation);
                options.onCitation?.(citation);
                break;
              }
              case "done": {
                messageId = (data as { messageId?: string }).messageId ?? "";
                break;
              }
              case "error": {
                streamError = new Error((data as { message?: string }).message ?? "stream error");
                break;
              }
            }
          }
        }

        if (streamError) throw streamError;

        setMessages((prev) => [
          ...prev,
          {
            id: messageId || `temp-${Date.now()}`,
            role: "assistant",
            content: fullContent,
            citations,
            createdAt: new Date().toISOString(),
          },
        ]);
        setStreamingContent("");
        options.onDone?.(messageId);
      } catch (err) {
        setStreamingContent("");
        options.onError?.(err instanceof Error ? err : new Error(String(err)));
      } finally {
        setIsStreaming(false);
      }
    },
    [setMessages, setStreamingContent, setIsStreaming],
  );

  return { sendMessage };
}
