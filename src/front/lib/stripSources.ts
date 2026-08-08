/**
 * Remove the trailing "## Sources" section from an answer.
 *
 * The section is what the citation badges are built from, so showing it in the
 * body as well would repeat every quoted passage in full. The stored message
 * keeps the raw text; only the rendering drops it.
 */
export function stripSources(content: string): string {
  return content.replace(/\n*^## Sources[ \t]*$[\s\S]*/m, "").trimEnd();
}
