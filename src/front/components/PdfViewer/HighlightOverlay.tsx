interface Highlight {
  id: string;
  pageNumber: number;
  positionData: {
    rects: { x: number; y: number; width: number; height: number }[];
    /** Page width the rects were measured at. Missing on records stored before
     * the viewer could be resized, which were always measured at 1.5x. */
    pageWidth?: number;
  };
  color: string;
}

interface HighlightOverlayProps {
  highlights: Highlight[];
  pageNumber: number;
  containerWidth: number;
  containerHeight: number;
  /** Page width at scale 1, used to reconstruct the width of legacy records. */
  basePageWidth: number;
  onHighlightClick: (selectionId: string) => void;
}

const LEGACY_SCALE = 1.5;

export function HighlightOverlay({
  highlights,
  pageNumber,
  containerWidth,
  containerHeight,
  basePageWidth,
  onHighlightClick,
}: HighlightOverlayProps) {
  const pageHighlights = highlights.filter((h) => h.pageNumber === pageNumber);

  return (
    // Sits above the text layer so highlights stay clickable, but the container
    // itself must not swallow pointer events: the text layer underneath needs
    // them for selection. Only the highlights themselves opt back in.
    <div
      className="pointer-events-none absolute top-0 left-0 z-10"
      style={{ width: containerWidth, height: containerHeight }}
    >
      {pageHighlights.map((h) => {
        // Rects are stored in page pixels, so they have to be rescaled whenever
        // the page is rendered at a different width than it was selected at.
        const storedWidth = h.positionData.pageWidth ?? basePageWidth * LEGACY_SCALE;
        const factor = storedWidth > 0 ? containerWidth / storedWidth : 1;

        return h.positionData.rects.map((rect, i) => (
          <button
            key={`${h.id}-${i}`}
            type="button"
            aria-label="ハイライトのチャットを開く"
            className="pointer-events-auto absolute opacity-30 cursor-pointer transition-opacity hover:opacity-50"
            style={{
              left: rect.x * factor,
              top: rect.y * factor,
              width: rect.width * factor,
              height: rect.height * factor,
              backgroundColor: h.color,
            }}
            onClick={(e) => {
              e.stopPropagation();
              onHighlightClick(h.id);
            }}
          />
        ));
      })}
    </div>
  );
}
