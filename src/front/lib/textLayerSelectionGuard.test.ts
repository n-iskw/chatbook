import { describe, it, expect } from "vite-plus/test";
import { guardInsertionPoint } from "./textLayerSelectionGuard";

/** A page as PdfPage builds it: a wrapper holding the canvas and the text layer. */
function page() {
  const wrapper = document.createElement("div");
  const textLayer = document.createElement("div");
  textLayer.className = "textLayer";
  const first = document.createElement("span");
  const second = document.createElement("span");
  textLayer.append(first, second);
  wrapper.append(textLayer);

  return { wrapper, textLayer, first, second };
}

describe("guardInsertionPoint", () => {
  it("puts the guard after the span the selection ends on", () => {
    const { textLayer, first, second } = page();

    expect(guardInsertionPoint(first, textLayer, false)).toStrictEqual({
      parent: textLayer,
      before: second,
    });
  });

  it("puts the guard before the span when the selection is growing upwards", () => {
    const { textLayer, second } = page();

    expect(guardInsertionPoint(second, textLayer, true)).toStrictEqual({
      parent: textLayer,
      before: second,
    });
  });

  it("leaves the guard alone when the selection ends on the layer itself", () => {
    // Dragging into blank space ends the selection on the layer. Treating the
    // layer as its own anchor would move the guard out to the page wrapper,
    // where it lays out as a full-width block and gets drawn as a highlight.
    const { textLayer } = page();

    expect(guardInsertionPoint(textLayer, textLayer, false)).toBeNull();
  });

  it("leaves the guard alone for a selection outside the layer", () => {
    const { textLayer } = page();
    const elsewhere = document.createElement("p");
    document.body.append(elsewhere);

    expect(guardInsertionPoint(elsewhere, textLayer, false)).toBeNull();
  });
});
