/**
 * Keeps a drag from selecting far more of the page than it looks like.
 *
 * pdf.js lays spans out in the order the PDF paints them, which is not reading
 * order: on a page with a figure, a caption can sit between two paragraphs in
 * the DOM. A selection is a DOM range, so releasing the pointer past the end of
 * a line — in the right margin, or in the blank band under a paragraph — lets
 * the browser run the range on to everything that follows in the DOM, and the
 * figure's labels light up.
 *
 * The fix is pdf.js' own: an `endOfContent` element is moved next to whichever
 * end of the selection is moving. Being right there, it absorbs the overshoot
 * instead of the spans further down the page. `.textLayer.selecting
 * .endOfContent` stretches it over the page while a drag is in progress.
 *
 * Ported from `TextLayerBuilder` in pdfjs-dist/web/pdf_viewer.mjs, narrowed to
 * one page's text layer: a spread has one of these guarding each of its pages,
 * and a selection that leaves one of them parks that page's guard.
 */
/**
 * Where the guard belongs for a selection ending on `anchor`, or null when it
 * must stay put.
 *
 * The anchor's *parent* decides, not the anchor itself: a selection that ends
 * on the text layer would otherwise send the guard out to the page wrapper,
 * where `.textLayer .endOfContent` no longer applies. It then lays out as an
 * ordinary full-width block, gets picked up by `getClientRects()`, and is drawn
 * as a highlight covering the page — while no longer guarding anything.
 */
export function guardInsertionPoint(
  anchor: Node,
  textLayer: Element,
  movingStart: boolean,
): { parent: Element; before: Node | null } | null {
  const parent = anchor.parentElement;
  if (!parent || parent.closest(".textLayer") !== textLayer) return null;

  return { parent, before: movingStart ? anchor : anchor.nextSibling };
}

export function guardTextLayerSelection(
  textLayer: HTMLElement,
  endOfContent: HTMLElement,
): () => void {
  let previousRange: Range | null = null;

  const park = () => {
    textLayer.append(endOfContent);
    endOfContent.style.width = "";
    endOfContent.style.height = "";
    textLayer.classList.remove("selecting");
  };

  const onSelectionChange = () => {
    const selection = document.getSelection();
    if (!selection?.rangeCount) {
      park();
      return;
    }

    const range = selection.getRangeAt(0);
    if (!range.intersectsNode(textLayer)) {
      park();
      return;
    }
    textLayer.classList.add("selecting");

    // Which end the pointer is dragging: the one that moved since last time
    const movingStart =
      previousRange !== null &&
      (range.compareBoundaryPoints(Range.END_TO_END, previousRange) === 0 ||
        range.compareBoundaryPoints(Range.START_TO_END, previousRange) === 0);

    let anchor: Node | null = movingStart ? range.startContainer : range.endContainer;
    if (anchor.nodeType === Node.TEXT_NODE) anchor = anchor.parentNode;

    // A range ending at offset 0 really ends on the previous element
    if (!movingStart && range.endOffset === 0) {
      do {
        while (anchor && !anchor.previousSibling) anchor = anchor.parentNode;
        anchor = anchor?.previousSibling ?? null;
      } while (anchor && !anchor.childNodes.length);
    }

    const target = anchor ? guardInsertionPoint(anchor, textLayer, movingStart) : null;
    if (target) {
      endOfContent.style.width = textLayer.style.width;
      endOfContent.style.height = textLayer.style.height;
      endOfContent.style.userSelect = "text";
      target.parent.insertBefore(endOfContent, target.before);
    }

    previousRange = range.cloneRange();
  };

  const onPointerDown = () => textLayer.classList.add("selecting");
  const onRelease = () => park();

  textLayer.addEventListener("pointerdown", onPointerDown);
  document.addEventListener("selectionchange", onSelectionChange);
  document.addEventListener("pointerup", onRelease);
  window.addEventListener("blur", onRelease);

  return () => {
    textLayer.removeEventListener("pointerdown", onPointerDown);
    document.removeEventListener("selectionchange", onSelectionChange);
    document.removeEventListener("pointerup", onRelease);
    window.removeEventListener("blur", onRelease);
  };
}
