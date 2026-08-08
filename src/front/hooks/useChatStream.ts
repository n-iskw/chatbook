import { useCallback } from "react";
import { useAtom } from "jotai";
import {
  chatMessagesAtom,
  streamingContentAtom,
  isStreamingAtom,
  type ChatMessage,
  type Citation,
} from "../atoms/chatAtom";

interface ChatStreamOptions {
  onCitation?: (citation: Citation) => void;
  onDone?: (messageId: string) => void;
  onError?: (error: Error) => void;
}

/**
 * Hook for sending messages and handling SSE streaming responses.
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
      // Add user message immediately
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
        const response = await fetch(
          `/api/pdf/${pdfId}/selections/${selectionId}/chats`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content, useWebSearch }),
          },
        );

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let buffer = "";
        let fullContent = "";
        const citations: Citation[] = [];
        let messageId = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("event: token")) {
              const dataLine = lines.find((l) => l.startsWith("data: ") && l.includes("content"));
              if (dataLine) {
                try {
                  const data = JSON.parse(dataLine.slice(6));
                  if (data.content) {
                    fullContent += data.content;
                    setStreamingContent(fullContent);
                  }
                } catch { /* ignore parse errors for partial chunks */ }
              }
            } else if (line.startsWith("event: citation")) {
              const dataLine = lines.find((l) => l.startsWith("data: "));
              if (dataLine) {
                try {
                  const citation = JSON.parse(dataLine.slice(6));
                  citations.push(citation);
                  options.onCitation?.(citation);
                } catch { /* ignore */ }
              }
            } else if (line.startsWith("event: done")) {
              const dataLine = lines.find((l) => l.startsWith("data: "));
              if (dataLine) {
                try {
                  const data = JSON.parse(dataLine.slice(6));
                  messageId = data.messageId;
                } catch { /* ignore */ }
              }
            } else if (line.startsWith("event: error")) {
              const dataLine = lines.find((l) => l.startsWith("data: "));
              if (dataLine) {
                try {
                  const data = JSON.parse(dataLine.slice(6));
                  throw new Error(data.message);
                } catch (e) {
                  if (e instanceof Error && e.message !== dataLine) throw e;
                }
              }
            }
          }
        }

        // Add assistant message
        const assistantMsg: ChatMessage = {
          id: messageId || `temp-${Date.now()}`,
          role: "assistant",
          content: fullContent,
          citations,
          createdAt: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, assistantMsg]);
        setStreamingContent("");
        options.onDone?.(messageId);
      } catch (err) {
        setStreamingContent("");
        const error = err instanceof Error ? err : new Error(String(err));
        options.onError?.(error);
      } finally {
        setIsStreaming(false);
      }
    },
    [setMessages, setStreamingContent, setIsStreaming],
  );

  return { sendMessage };
}
