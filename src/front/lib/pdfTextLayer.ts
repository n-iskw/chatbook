/**
 * Whether pdf.js returned selectable text for a page.
 *
 * TextMarkedContent entries are part of the same response but do not carry
 * characters. A page containing only those entries is still an image page
 * from the reader's point of view and cannot produce a useful selection.
 */
export function hasSelectablePdfText(items: readonly unknown[]): boolean {
  return items.some((item) => {
    if (typeof item !== "object" || item === null || !("str" in item)) return false;
    const text = (item as { str?: unknown }).str;
    return typeof text === "string" && text.trim().length > 0;
  });
}
