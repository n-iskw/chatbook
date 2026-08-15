import { useId, type ReactNode } from "react";
import useSWRImmutable from "swr/immutable";

/** Turns mermaid source into an SVG document. Injected so tests can skip the real drawing. */
export type RenderDiagram = (id: string, code: string) => Promise<string>;

interface MermaidBlockProps {
  /** The fence's contents, i.e. the diagram source */
  code: string;
  /** Shown until the diagram is drawn, and instead of it if the source does not parse */
  fallback: ReactNode;
  renderDiagram?: RenderDiagram;
}

/**
 * mermaid is a megabyte of its own, and most answers have no diagram in them,
 * so it is fetched only once one shows up.
 */
const drawWithMermaid: RenderDiagram = async (id, code) => {
  const { default: mermaid } = await import("mermaid");
  mermaid.initialize({
    startOnLoad: false,
    // Without this, a source that does not parse leaves mermaid's own "Syntax
    // error" drawing in a <div> on <body>, where it sits under the whole page.
    // Half-streamed sources fail to parse constantly, so the fallback below is
    // what says so instead.
    suppressErrorRendering: true,
    // Labels are drawn as SVG text rather than HTML in a <foreignObject>.
    // The HTML path lays a label out with `white-space: nowrap` and
    // `max-width: 200px`, then turns wrapping on only when the measured box
    // comes back as exactly 200 -- and it measures with getBoundingClientRect,
    // which the browser's page zoom scales. At any zoom but 100% the
    // comparison misses, so the label keeps `nowrap` and is cut off where the
    // <foreignObject> ends. Japanese has no spaces, so a cut lands mid
    // sentence. SVG text is measured in user units, which zoom does not touch,
    // and wraps between characters rather than at spaces.
    htmlLabels: false,
  });
  const { svg } = await mermaid.render(id, code);
  return svg;
};

/**
 * A ```mermaid fence, drawn as a diagram.
 *
 * The answer streams in token by token, so for most of its life the source is
 * a fragment that parses into nothing. Rather than show an error for each of
 * those, an undrawable source falls back to the code block the rest of the
 * markdown would have rendered, and turns into a diagram once it completes.
 */
export function MermaidBlock({
  code,
  fallback,
  renderDiagram = drawWithMermaid,
}: MermaidBlockProps) {
  // mermaid puts this in the DOM as an id, where useId's own colons would make
  // it unusable as a selector
  const id = `mermaid-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  const { data: svg } = useSWRImmutable(["mermaid", code], () => renderDiagram(id, code), {
    // Every keystroke of the stream is a new key, so retrying a source that
    // did not parse only burns work on a fragment that is already outdated
    shouldRetryOnError: false,
  });

  if (svg === undefined) return fallback;

  return (
    <div
      className="mb-2 overflow-x-auto rounded bg-white p-2 last:mb-0"
      // mermaid sanitizes its own output (securityLevel defaults to "strict")
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
