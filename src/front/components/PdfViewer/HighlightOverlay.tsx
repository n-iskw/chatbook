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
    <div
      className="absolute top-0 left-0"
      style={{ width: containerWidth, height: containerHeight }}
    >
      {pageHighlights.map((h) =>
        h.positionData.rects.map((rect, i) => (
          <div
            key={`${h.id}-${i}`}
            className="absolute opacity-30 cursor-pointer transition-opacity hover:opacity-50"
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
