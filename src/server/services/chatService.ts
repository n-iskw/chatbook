export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Build the messages array for the DeepSeek API call.
 */
export function buildMessages(
  systemPrompt: string,
  history: { role: string; content: string }[],
  userMessage: string,
): ChatMessage[] {
  return [
    { role: "system", content: systemPrompt },
    ...history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    { role: "user", content: userMessage },
  ];
}

export interface Citation {
  id: string;
  type: "pdf" | "web";
  text: string;
  pageNumber?: number;
  url?: string;
}

/**
 * Find the approximate page number for a text snippet by searching in the full text.
 * Uses character-position-based heuristic.
 */
function findPageNumber(text: string, fullText: string, pageCount: number): number | undefined {
  if (pageCount <= 1 || !text) return undefined;

  const idx = fullText.indexOf(text);
  if (idx < 0) return undefined;

  // Approximate page by position ratio
  const pageSize = fullText.length / pageCount;
  return Math.min(pageCount, Math.floor(idx / pageSize) + 1);
}

/**
 * Parse citations from the AI response text.
 * Looks for "## Sources" section and extracts [n] entries.
 * For PDF citations, finds the page number by searching the full text.
 */
export function parseCitations(
  responseText: string,
  fullText?: string,
  pageCount?: number,
): Citation[] {
  const citations: Citation[] = [];

  // Find "## Sources" section
  const sourcesMatch = responseText.match(/## Sources\n([\s\S]*)$/);
  if (!sourcesMatch) return citations;

  const sourcesText = sourcesMatch[1];
  const lines = sourcesText.split("\n");

  for (const line of lines) {
    const match = line.match(/^\[(\d+)\]\s+(.+)$/);
    if (!match) continue;

    const id = match[1];
    const content = match[2].trim();

    // Check if it's a web citation (contains URL)
    const urlMatch = content.match(/^(.+?)\s*-\s*(https?:\/\/\S+)$/);
    if (urlMatch) {
      citations.push({
        id,
        type: "web",
        text: urlMatch[1].replace(/^"|"$/g, ""),
        url: urlMatch[2],
      });
    } else {
      // PDF citation - extract quoted text and find page number
      const quotedText = content.replace(/^"|"$/g, "");
      const pageNumber =
        fullText && pageCount ? findPageNumber(quotedText, fullText, pageCount) : undefined;

      citations.push({
        id,
        type: "pdf",
        text: quotedText,
        pageNumber,
      });
    }
  }

  return citations;
}
