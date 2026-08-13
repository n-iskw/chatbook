import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { configure } from "@testing-library/react";
import { installViewportStub, resetViewport } from "./viewport";

// Several of the viewer's paths are deliberately on a timer — the pause before
// a selection is measured, and the wait for the one after it to stop growing —
// so a `findBy` here is waiting on real time, not on a promise. The default
// second is close enough to those pauses that a machine running the whole suite
// in parallel loses the race, which shows up as a different test failing each
// run. Waiting longer costs nothing when the assertion is going to pass, and
// only delays the report when it is not.
configure({ asyncUtilTimeout: 5000 });

// jsdom has no layout engine, so it ships no scrollIntoView. Components that
// keep a conversation pinned to the bottom would throw on mount without it.
Element.prototype.scrollIntoView = () => {};

// Nor does it observe anything, having nothing to measure. The viewer builds a
// ResizeObserver to keep the page fitted to its pane; a stub that never reports
// leaves it at the size it starts with, which is what jsdom can honestly say.
if (!("ResizeObserver" in globalThis)) {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// Which layout the reader is in comes from `matchMedia`, which jsdom also
// lacks. The stub answers desktop until a test says otherwise.
installViewportStub();
afterEach(resetViewport);

// pdf.js constructs a DOMMatrix at module scope, which jsdom does not provide.
// jsdom tests never rasterize a page, so anything that can be constructed is
// enough to let modules that transitively import pdf.js load.
if (!("DOMMatrix" in globalThis)) {
  (globalThis as { DOMMatrix?: unknown }).DOMMatrix = class {};
}
