interface Highlight {
  id: string;
  pageNumber: number;
  positionData: {
    rects: { x: number; y: number; width: number; height: number }[];
  };
  color: string;
}

interface HighlightOverlayProps {
  highlights: Highlight[];
  pageNumber: number;
  containerWidth: number;
  containerHeight: number;
  onHighlightClick: (selectionId: string) => void;
}

export function HighlightOverlay({
  highlights,
  pageNumber,
  containerWidth,
  containerHeight,
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
      {pageHighlights.map((h) =>
        h.positionData.rects.map((rect, i) => (
          <button
            key={`${h.id}-${i}`}
            type="button"
            aria-label="ハイライトのチャットを開く"
            className="pointer-events-auto absolute opacity-30 cursor-pointer transition-opacity hover:opacity-50"
            style={{
              left: rect.x,
              top: rect.y,
              width: rect.width,
              height: rect.height,
              backgroundColor: h.color,
            }}
            onClick={(e) => {
              e.stopPropagation();
              onHighlightClick(h.id);
            }}
          />
        )),
      )}
    </div>
  );
}
