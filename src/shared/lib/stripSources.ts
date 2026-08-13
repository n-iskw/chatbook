/**
 * Remove the trailing "## Sources" section from an answer.
 *
 * The section is what the citation badges are built from, so showing it in the
 * body as well would repeat every quoted passage in full — and so would sending
 * it back as conversation history. The stored message keeps the raw text; the
 * rendering and the history handed to the LLM both drop the section.
 */
export function stripSources(content: string): string {
  return content.replace(/\n*^## Sources[ \t]*$[\s\S]*/m, "").trimEnd();
}
