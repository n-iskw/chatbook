import { describe, it, expect } from "vite-plus/test";
import { render, screen } from "@testing-library/react";
import { HighlightOverlay } from "./HighlightOverlay";

const HIGHLIGHT_LABEL = "ハイライトのチャットを開く";

function highlight(pageWidth?: number) {
  return {
    id: "s1",
    pageNumber: 1,
    positionData: { rects: [{ x: 10, y: 20, width: 100, height: 12 }], pageWidth },
    color: "#FFEB3B",
  };
}

describe("HighlightOverlay", () => {
  it("scales a stored highlight to the page width it is rendered at", () => {
    render(
      // 300 is deliberately not the legacy width (400 * 1.5), so an
      // implementation that ignores the stored pageWidth cannot pass
      <HighlightOverlay
        highlights={[highlight(300)]}
        pageNumber={1}
        containerWidth={1200}
        containerHeight={1600}
        basePageWidth={400}
        onHighlightClick={() => {}}
      />,
    );

    const rect = screen.getByRole("button", { name: HIGHLIGHT_LABEL });
    expect([rect.style.left, rect.style.top, rect.style.width, rect.style.height]).toEqual([
      "40px",
      "80px",
      "400px",
      "48px",
    ]);
  });

  it("draws the passage being asked about, which the browser stops showing once the popover takes focus", () => {
    render(
      <HighlightOverlay
        highlights={[]}
        pageNumber={1}
        containerWidth={1200}
        containerHeight={1600}
        basePageWidth={400}
        pending={{ rects: [{ x: 10, y: 20, width: 100, height: 12 }], pageWidth: 600 }}
        onHighlightClick={() => {}}
      />,
    );

    const [rect] = screen.getAllByTestId("pending-selection");
    expect([rect.style.left, rect.style.top, rect.style.width, rect.style.height]).toEqual([
      "20px",
      "40px",
      "200px",
      "24px",
    ]);
    // It only marks the spot; the text underneath has to stay selectable
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("reads a highlight stored before page widths were recorded at the old fixed 1.5 scale", () => {
    render(
      <HighlightOverlay
        highlights={[highlight()]}
        pageNumber={1}
        containerWidth={1200}
        containerHeight={1600}
        basePageWidth={400}
        onHighlightClick={() => {}}
      />,
    );

    // 旧レコードは 400 * 1.5 = 600px 幅で計測されている
    const rect = screen.getByRole("button", { name: HIGHLIGHT_LABEL });
    expect([rect.style.left, rect.style.top, rect.style.width, rect.style.height]).toEqual([
      "20px",
      "40px",
      "200px",
      "24px",
    ]);
  });
});
