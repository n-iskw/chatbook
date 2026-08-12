import { citationSchema, type Citation } from "../../shared/schemas/citation";
import type { LocatedPage } from "../../shared/schemas/book";
import { stripSources } from "../../shared/lib/stripSources";

export type { Citation } from "../../shared/schemas/citation";

/**
 * The sources stored with an answer, or null when there are none to show.
 *
 * Forgiving on purpose, like the highlight geometry: an answer whose citations
 * column cannot be read must not make the whole conversation unreadable, since
 * the answer itself is still there to show.
 */
export function readCitations(stored: string | null): Citation[] | null {
  if (!stored) return null;
  try {
    const parsed = citationSchema.array().safeParse(JSON.parse(stored));
    if (parsed.success) return parsed.data;
  } catch {
    // Not even JSON — fall through and show the answer without sources
  }
  return null;
}

/**
 * A turn as the LLM is given it. Not the stored `ChatMessage`: this one also
 * carries the `system` turn, which is built per request and never persisted.
 */
export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** A turn of the conversation itself, which both endpoints are given. */
export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
}

/**
 * The conversation as the model is given it: the earlier turns, then the new
 * question.
 *
 * Past answers are sent without their `## Sources` section: it quotes the
 * passages in full, and resending it every turn pays for the same text again
 * even though the citations are already stored in their own column.
 *
 * The two endpoints differ in where the system prompt goes, not in what the
 * conversation is, so they share this and only this.
 */
export function buildConversation(
  history: { role: string; content: string }[],
  userMessage: string,
): ConversationTurn[] {
  return [
    ...history.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.role === "assistant" ? stripSources(m.content) : m.content,
    })),
    { role: "user" as const, content: userMessage },
  ];
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
 * Length of the fragments used when a quote does not appear verbatim, and how
 * far apart they start. Long enough to be unique in a book, short enough to
 * survive the model rewording a clause.
 */
const FRAGMENT_LENGTH = 24;
const FRAGMENT_STEP = 12;

/** The page whose text contains the needle, or -1. */
function pageContaining(normalizedPages: string[], needle: string): number {
  return normalizedPages.findIndex((page) => page.includes(needle));
}

/**
 * Page number for a quoted passage, found by searching each page's text.
 *
 * The model rarely reproduces a passage character for character, so a failed
 * whole-quote match falls back to fragments of it. Falls back further to a
 * position ratio for records stored before the extractor delimited pages.
 */
export function findPageNumber(text: string, fullText: string, pageCount: number): LocatedPage {
  const needle = normalize(text);
  if (!needle) return { found: false, miss: "no-quote" };
  if (pageCount <= 1) return { found: false, miss: "single-page-book" };

  const pages = fullText.split(PAGE_DELIMITER);
  if (pages.length <= 1) {
    const idx = normalize(fullText).indexOf(needle);
    if (idx < 0) return { found: false, miss: "not-in-book" };
    const pageSize = normalize(fullText).length / pageCount;
    return { found: true, pageNumber: Math.min(pageCount, Math.floor(idx / pageSize) + 1) };
  }

  const normalizedPages = pages.map(normalize);
  const onOnePage = pageContaining(normalizedPages, needle);
  if (onOnePage >= 0) return { found: true, pageNumber: onOnePage + 1 };

  // A quote can start near the bottom of a page and finish on the next one
  for (let i = 0; i < normalizedPages.length - 1; i++) {
    if ((normalizedPages[i] + normalizedPages[i + 1]).includes(needle)) {
      return { found: true, pageNumber: i + 1 };
    }
  }

  // Scan fragments from the start of the quote, so the first hit is the page
  // the passage begins on
  for (let start = 0; start + FRAGMENT_LENGTH <= needle.length; start += FRAGMENT_STEP) {
    const page = pageContaining(normalizedPages, needle.slice(start, start + FRAGMENT_LENGTH));
    if (page >= 0) return { found: true, pageNumber: page + 1 };
  }

  return { found: false, miss: "not-in-book" };
}

/**
 * A quoted block, each opening mark closed by its own kind so a passage that
 * carries an apostrophe is not cut at it. None of them nest: the model writes
 * quotes side by side, never one inside another.
 */
const QUOTED_BLOCK = /「[^「」]+」|"[^"]+"|“[^”]+”|'[^']+'/g;

/**
 * The link in a Sources entry, looked for outside what the entry quotes.
 *
 * The model writes the link in more shapes than the prompt asks for — after an
 * em dash, in parentheses, behind a title that carries a hyphen of its own — so
 * requiring one fixed separator misread web sources as passages of the book and
 * sent them to be looked up in it, which cost the reader the link.
 *
 * A book about the web prints urls in its own body, so the quoted blocks are
 * dropped before the search: what makes a source a web one is that its url
 * stands outside the quotation marks.
 */
const URL_OUTSIDE_QUOTES = /https?:\/\/[^\s)）」』"'、。]+/;

/**
 * The passage a Sources entry quotes, or the entry itself when it quotes
 * nothing.
 *
 * The model writes `「passage」（本書 第1章）`, so the trailing note has to be
 * dropped before the passage can be looked up in the document. It also names
 * the section it is quoting from, and quotes more than once. Reading the entry
 * as one block from its first mark to its last stitched those together into a
 * string the book does not hold, which cost the reader the page as well as the
 * mark on it.
 *
 * The last block is the passage. The section is named before what is quoted
 * from it, so the order tells the two apart where their length does not — a
 * section title can be the longer of the two. Of two passages one has to be
 * dropped either way, and the entry only carries one `[n]` to link them to.
 */
function extractQuotedText(entry: string): string {
  const blocks = entry.match(QUOTED_BLOCK);
  if (!blocks) return entry;

  return blocks[blocks.length - 1].slice(1, -1);
}

/**
 * What a web entry is about: the passage it quotes, or the page's title when it
 * quotes nothing.
 *
 * The first block is the one to take, the opposite of a PDF entry: here the
 * quote comes first and the page that carries it is named after, and that title
 * may be quoted too（`「Backend for Frontend Pattern」`）.
 */
function describeWebSource(entry: string, url: string): string {
  const blocks = entry.match(QUOTED_BLOCK);
  if (blocks) return blocks[0].slice(1, -1);

  // Nothing quoted: the entry is the title, with the link and the punctuation
  // that introduced it left behind. A bracket goes only when it is the one
  // holding the link — a title of its own can close on one（`比較（…低コスト）`）
  // and reads as a sentence cut short without it.
  const start = entry.indexOf(url);
  const before = entry.slice(0, start).trimEnd();
  const after = entry.slice(start + url.length);
  const bracketed = /[(（]$/.test(before) && /^\s*[)）]/.test(after);

  return (bracketed ? before.slice(0, -1) : before).replace(/[\s\-—–:：、。,.]+$/, "").trim();
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

    // Check if it's a web citation (names a URL outside what it quotes)
    const urlMatch = content.replace(QUOTED_BLOCK, "").match(URL_OUTSIDE_QUOTES);
    if (urlMatch) {
      citations.push({
        id,
        type: "web",
        text: describeWebSource(content, urlMatch[0]),
        url: urlMatch[0],
      });
    } else {
      // PDF citation - extract quoted text and find page number
      const quotedText = extractQuotedText(content);
      const located =
        fullText && pageCount ? findPageNumber(quotedText, fullText, pageCount) : undefined;

      citations.push({
        id,
        type: "pdf",
        text: quotedText,
        // One of the two, never both, and neither when there was no book text
        ...(located?.found === true ? { pageNumber: located.pageNumber } : {}),
        ...(located?.found === false ? { pageMiss: located.miss } : {}),
      });
    }
  }

  return citations;
}
