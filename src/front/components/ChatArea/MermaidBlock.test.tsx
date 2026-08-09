import { describe, it, expect } from "vite-plus/test";
import { act, render, screen, waitFor } from "@testing-library/react";
import { MermaidBlock } from "./MermaidBlock";
import { SwrTestCache } from "../../../test/swrTestCache";

/** Stands in for mermaid, which needs the SVG layout a browser has and jsdom does not. */
const drawSource = (_id: string, code: string) =>
  Promise.resolve(`<svg aria-label="diagram"><text>${code}</text></svg>`);

/** What the bubble shows when the source cannot be drawn: the code as typed. */
function codeFallback() {
  return (
    <pre>
      <code>graph TD</code>
    </pre>
  );
}

function renderBlock(
  renderDiagram: (id: string, code: string) => Promise<string>,
  code = "graph TD",
) {
  return render(
    <SwrTestCache>
      <MermaidBlock code={code} fallback={codeFallback()} renderDiagram={renderDiagram} />
    </SwrTestCache>,
  );
}

describe("MermaidBlock", () => {
  it("shows the diagram mermaid drew from the source it was given", async () => {
    const { container } = renderBlock(drawSource, "flowchart LR");

    await waitFor(() =>
      expect(container.querySelector("svg")?.outerHTML).toBe(
        '<svg aria-label="diagram"><text>flowchart LR</text></svg>',
      ),
    );
  });

  it("draws under an id that can be written as a css selector", async () => {
    const ids: string[] = [];
    renderBlock((id, code) => {
      ids.push(id);
      return drawSource(id, code);
    });

    await waitFor(() => expect(ids).toHaveLength(1));
    // mermaid puts this id in the DOM and looks it back up, so the colons
    // React's own useId hands out would make it an invalid selector
    expect(ids[0]).toMatch(/^mermaid-[a-zA-Z0-9]+$/);
  });

  // While the answer streams in, the fence arrives a token at a time, so the
  // source is unparsable for most of its life
  it("shows the code block when mermaid cannot parse the source", async () => {
    renderBlock(() => Promise.reject(new Error("Parse error")));

    // let the rejection settle, so this is the failure and not the wait for it
    await act(async () => {});
    expect(screen.getByText("graph TD").tagName).toBe("CODE");
  });

  it("shows the code block while the diagram is still being drawn", () => {
    renderBlock(() => new Promise<string>(() => {}));

    expect(screen.getByText("graph TD").tagName).toBe("CODE");
  });
});
