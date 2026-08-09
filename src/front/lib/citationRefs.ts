/**
 * The `[n]` markers an answer's body carries, turned into links to the sources
 * the answer was given with.
 *
 * The rewrite happens on the markdown source rather than on the rendered tree:
 * markdown already tells code apart from prose, so working here is what keeps
 * `arr[1]` inside a code block from becoming a citation. The href is a fragment
 * so react-markdown's own url check passes it through untouched; nothing ever
 * navigates to it, because the link the bubble builds from it is a button.
 */

/** Marks a link as a citation reference, and names the source it points at. */
function citationHref(id: string): string {
  return `#citation-${id}`;
}

/** The source id a rewritten link names, or null for an ordinary link. */
export function citationIdFromHref(href: string | undefined): string | null {
  const marker = href?.match(/^#citation-(\d+)$/);
  return marker ? marker[1] : null;
}

/**
 * Code first, so a `[1]` inside a fence or a code span is left as it is, then
 * the marker itself with the two characters that decide whether it is one:
 * `![1]` starts an image and `[1](` is already a link of its own.
 */
const CODE_OR_REFERENCE = /(```[\s\S]*?```|`[^`\n]*`)|(!?)\[(\d+)\](\(?)/g;

/**
 * The answer body with every `[n]` that names one of `ids` rewritten as a link.
 *
 * A marker with no source behind it is left alone: an answer still streaming
 * has none of its citations yet, and one that names a source it never listed
 * has nothing to jump to.
 */
export function linkifyCitationRefs(markdown: string, ids: ReadonlySet<string>): string {
  return markdown.replace(CODE_OR_REFERENCE, (match, code, bang, id, openParen) => {
    if (code !== undefined) return match;
    if (bang || openParen || !ids.has(id)) return match;
    return `[[${id}]](${citationHref(id)})`;
  });
}
