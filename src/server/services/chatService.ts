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
 * Parse citations from the AI response text.
 * Looks for "## Sources" section and extracts [n] entries.
 */
export function parseCitations(responseText: string): Citation[] {
  const citations: Citation[] = [];

  // Find "## Sources" section
  const sourcesMatch = responseText.match(/## Sources\n([\s\S]*)$/);
  if (!sourcesMatch) return citations;

  const sourcesText = sourcesMatch[1];
  const lines = sourcesText.split("\n");

  for (const line of lines) {
    // Match: [n] "text" or [n] text - URL
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
      // PDF citation (quoted text)
      citations.push({
        id,
        type: "pdf",
        text: content.replace(/^"|"$/g, ""),
      });
    }
  }

  return citations;
}
