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

/** pdfLoader が fullText に埋めるページ区切り。 */
const PAGE_DELIMITER = "\f";

/**
 * Whitespace is where the quote and the extracted text diverge: pdf.js joins
 * text items with spaces, while the model quotes the passage as it reads.
 */
function normalize(text: string): string {
  return text.replace(/\s+/g, "");
}

/**
 * Page number for a quoted passage, found by searching each page's text.
 * Falls back to a position ratio for records stored before the extractor
 * started delimiting pages.
 */
export function findPageNumber(
  text: string,
  fullText: string,
  pageCount: number,
): number | undefined {
  const needle = normalize(text);
  if (pageCount <= 1 || !needle) return undefined;

  const pages = fullText.split(PAGE_DELIMITER);
  if (pages.length <= 1) {
    const idx = normalize(fullText).indexOf(needle);
    if (idx < 0) return undefined;
    const pageSize = normalize(fullText).length / pageCount;
    return Math.min(pageCount, Math.floor(idx / pageSize) + 1);
  }

  const normalizedPages = pages.map(normalize);
  const onOnePage = normalizedPages.findIndex((page) => page.includes(needle));
  if (onOnePage >= 0) return onOnePage + 1;

  // A quote can start near the bottom of a page and finish on the next one
  for (let i = 0; i < normalizedPages.length - 1; i++) {
    if ((normalizedPages[i] + normalizedPages[i + 1]).includes(needle)) return i + 1;
  }

  return undefined;
}

/**
 * Text inside the outermost quotation marks of a Sources entry.
 * The model writes `「passage」（本書 第1章）`, so the trailing note has to be
 * dropped before the passage can be looked up in the document.
 */
function extractQuotedText(entry: string): string {
  const quoted = entry.match(/[「"“']([\s\S]+)[」"”']/);
  return quoted ? quoted[1] : entry;
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
      const quotedText = extractQuotedText(content);
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
