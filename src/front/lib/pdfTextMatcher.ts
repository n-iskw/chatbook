export interface SelectionPosition {
  startIndex: number;
  endIndex: number;
  pageNumber: number;
  rects: { x: number; y: number; width: number; height: number }[];
}

/** The passage the reader dragged over, located in the page's text items. */
export interface SelectionFromTextLayer {
  text: string;
  startIndex: number;
  endIndex: number;
  pageNumber: number;
}

interface TextSegment {
  start: number;
  end: number;
  isWordLike: boolean;
}

/**
 * The browser lets a drag finish in the middle of a text item. That is useful
 * for ordinary web copy, but it makes a PDF passage feel accidental: the
 * quote can start or end halfway through a word. Segment the complete text
 * layer first, then move both ends to the word that the reader touched.
 *
 * `Intl.Segmenter` knows how to find words in Japanese as well as whitespace-
 * separated languages. The fallback is deliberately conservative for older
 * browsers: it keeps runs of letters and numbers together and leaves
 * punctuation as its own boundary.
 */
export function snapSelectionToWordBoundaries(range: Range): Range {
  if (range.collapsed) return range;

  const textLayer = findTextLayerContainer(range.commonAncestorContainer);
  if (!textLayer) return range;

  const text = textLayer.textContent ?? "";
  const start = offsetWithinTextLayer(textLayer, range.startContainer, range.startOffset);
  const end = offsetWithinTextLayer(textLayer, range.endContainer, range.endOffset);
  if (start === null || end === null || start >= end) return range;

  const segments = segmentText(text);
  const snappedStart = snapStart(text, start, segments);
  const snappedEnd = snapEnd(text, end, segments);
  if (snappedStart >= snappedEnd) {
    const empty = range.cloneRange();
    setRangeBoundary(empty, textLayer, snappedStart, "start");
    empty.collapse(true);
    return empty;
  }

  const snapped = range.cloneRange();
  if (!setRangeBoundary(snapped, textLayer, snappedStart, "start")) return range;
  if (!setRangeBoundary(snapped, textLayer, snappedEnd, "end")) return range;
  return snapped;
}

/**
 * Get the text item indices a range covers.
 * Returns null if the range is empty or not within our text layer.
 *
 * The range is passed in rather than read from the browser's own selection: the
 * caller has already kept it to one page, and the item indices only mean
 * anything within the page they were laid out on.
 */
export function getSelectionFromTextLayer(range: Range): SelectionFromTextLayer | null {
  if (range.collapsed) return null;

  const text = range.toString().trim();
  if (!text) return null;

  // Find the text layer container (ancestor with text layer spans)
  const container = range.commonAncestorContainer;
  const textLayer = findTextLayerContainer(container);
  if (!textLayer) return null;

  // Get all spans within the selection range
  const spans = textLayer.querySelectorAll("span[data-text-item-index]");
  if (spans.length === 0) return null;

  // Find start and end indices
  const selectionSpans = getSelectedSpans(range, Array.from(spans) as HTMLElement[]);
  if (selectionSpans.length === 0) return null;

  const startIndex = parseInt(selectionSpans[0].dataset.textItemIndex!, 10);
  const endIndex = parseInt(selectionSpans[selectionSpans.length - 1].dataset.textItemIndex!, 10);
  const pageNumber = parseInt(selectionSpans[0].dataset.pageNumber!, 10);

  return {
    text,
    startIndex,
    endIndex,
    pageNumber,
  };
}

function textNodesIn(textLayer: HTMLElement): Text[] {
  const walker = document.createTreeWalker(textLayer, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let node = walker.nextNode();
  while (node) {
    nodes.push(node as Text);
    node = walker.nextNode();
  }
  return nodes;
}

/** Convert a DOM Range boundary into a UTF-16 offset in the text layer. */
function offsetWithinTextLayer(
  textLayer: HTMLElement,
  container: Node,
  offset: number,
): number | null {
  if (!textLayer.contains(container)) return null;

  const prefix = document.createRange();
  try {
    prefix.selectNodeContents(textLayer);
    prefix.setEnd(container, offset);
    return prefix.toString().length;
  } catch {
    // A browser can report a boundary from a node that was removed while a
    // page was being resized. Leaving that selection untouched is safer than
    // manufacturing a quote from a different passage.
    return null;
  }
}

function setRangeBoundary(
  range: Range,
  textLayer: HTMLElement,
  offset: number,
  side: "start" | "end",
): boolean {
  const nodes = textNodesIn(textLayer);
  let position = 0;

  for (const node of nodes) {
    const length = node.data.length;
    const end = position + length;
    // A start at a text-node boundary belongs to the following node. An end
    // at the same boundary belongs to the preceding node. Both represent the
    // same DOM position, but this keeps span intersection out of the result.
    const atThisNode = offset < end || (side === "end" && offset === end);
    if (atThisNode) {
      const boundary = Math.max(0, offset - position);
      if (side === "start") range.setStart(node, boundary);
      else range.setEnd(node, boundary);
      return true;
    }
    position = end;
  }

  const last = nodes.at(-1);
  if (!last || offset !== position) return false;
  if (side === "start") range.setStart(last, last.data.length);
  else range.setEnd(last, last.data.length);
  return true;
}

function segmentText(text: string): TextSegment[] {
  if (!text) return [];

  if (typeof Intl.Segmenter === "function") {
    return Array.from(new Intl.Segmenter(undefined, { granularity: "word" }).segment(text)).map(
      ({ index, segment, isWordLike }) => ({
        start: index,
        end: index + segment.length,
        isWordLike: isWordLike ?? false,
      }),
    );
  }

  const fallback: TextSegment[] = [];
  let start = 0;
  let previousWordLike: boolean | null = null;
  for (const character of text) {
    const isWordLike = /[\p{L}\p{N}\p{M}]/u.test(character);
    const end = start + character.length;
    if (previousWordLike === null || previousWordLike !== isWordLike) {
      fallback.push({ start, end, isWordLike });
    } else {
      fallback[fallback.length - 1].end = end;
    }
    previousWordLike = isWordLike;
    start = end;
  }
  return fallback;
}

function snapStart(text: string, offset: number, segments: TextSegment[]): number {
  let start = offset;
  while (start < text.length && /\s/u.test(text[start] ?? "")) start += 1;
  if (start >= text.length) return start;

  const segment = segments.find(({ start: begin, end }) => start >= begin && start < end);
  return segment?.isWordLike ? segment.start : start;
}

function snapEnd(text: string, offset: number, segments: TextSegment[]): number {
  let end = offset;
  while (end > 0 && /\s/u.test(text[end - 1] ?? "")) end -= 1;
  if (end <= 0) return end;

  const segment = segments.find(({ start, end: finish }) => end > start && end <= finish);
  return segment?.isWordLike ? segment.end : end;
}

function findTextLayerContainer(node: Node): HTMLElement | null {
  let current: Node | null = node;
  while (current) {
    if (current instanceof HTMLElement && current.querySelector("span[data-text-item-index]")) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

function getSelectedSpans(range: Range, allSpans: HTMLElement[]): HTMLElement[] {
  const selected: HTMLElement[] = [];
  for (const span of allSpans) {
    if (range.intersectsNode(span)) {
      selected.push(span);
    }
  }
  return selected;
}
