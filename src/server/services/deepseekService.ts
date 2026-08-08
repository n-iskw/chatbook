import OpenAI from "openai";
import type { ChatMessage } from "./chatService";

interface StreamCallbacks {
  onToken: (token: string) => void;
  onDone: (usage: { inputTokens: number; outputTokens: number }) => void;
  onError: (error: Error) => void;
}

/**
 * Build the system prompt for the AI assistant.
 */
export function buildSystemPrompt(fullText: string, selectedText: string, useWebSearch: boolean): string {
  const webSearchInstruction = useWebSearch
    ? `\n\nWhen the document does not contain enough information to answer the question, you may use web search to find additional context. Always indicate when you are using external sources.`
    : `\n\nRespond using only the document context. If the document does not contain the answer, say so clearly.`;

  return `You are a helpful AI assistant analyzing a PDF document.
Use the following document as your primary context:

--- DOCUMENT START ---
${fullText}
--- DOCUMENT END ---

The user has highlighted this specific passage and is asking about it:
--- HIGHLIGHTED PASSAGE ---
${selectedText}
--- END HIGHLIGHTED PASSAGE ---

Instructions:
- Answer questions based primarily on the document content.
- When the document does not contain the answer, say so clearly, then provide what you know.
- Keep answers concise and well-structured.${webSearchInstruction}

When answering, follow these citation rules strictly:
1. Reference sources inline using [n] notation.
2. For PDF content: cite the exact passage you're referencing.
3. For web search results: cite the page title and URL.
4. At the end of every response, include a "## Sources" section listing all citations:
   - [n] "exact quoted text from the document"
   - [n] Page Title - URL

Example:
The document states that Workers run on Cloudflare's global network[1].

## Sources
[1] "Workers execute on Cloudflare's global network across 300+ cities"`;
}

/**
 * Stream a chat completion from DeepSeek API.
 * Uses the OpenAI-compatible Chat Completions endpoint.
 */
export async function streamChatCompletion(
  apiKey: string,
  messages: ChatMessage[],
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  const client = new OpenAI({
    apiKey,
    baseURL: "https://api.deepseek.com",
  });

  try {
    const stream = await client.chat.completions.create(
      {
        model: "deepseek-v4-flash",
        messages,
        stream: true,
        stream_options: { include_usage: true },
      },
      { signal },
    );

    let fullContent = "";
    let usage = { inputTokens: 0, outputTokens: 0 };

    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) {
        fullContent += delta;
        callbacks.onToken(delta);
      }
      if (chunk.usage) {
        usage = {
          inputTokens: chunk.usage.prompt_tokens ?? 0,
          outputTokens: chunk.usage.completion_tokens ?? 0,
        };
      }
    }

    callbacks.onDone(usage);
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") return;
    callbacks.onError(err instanceof Error ? err : new Error(String(err)));
  }
}
