import type { ComponentProps } from "react";
import { describe, it, expect } from "vite-plus/test";
import { render, screen } from "@testing-library/react";
import { HighlightOverlay } from "./HighlightOverlay";

const HIGHLIGHT_LABEL = "ハイライトのチャットを開く";

/** One line, measured on a page 600 wide, as both transient marks carry it. */
const MEASURED_MARK = { rects: [{ x: 10, y: 20, width: 100, height: 12 }], pageWidth: 600 };

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
    expect([rect.style.left, rect.style.top, rect.style.width, rect.style.height]).toStrictEqual([
      "40px",
      "80px",
      "400px",
      "48px",
    ]);
  });

  // The two marks that are not highlights: the passage being asked about, which
  // the browser stops showing the moment the popover takes focus, and the
  // passage a citation quoted. Both are drawn by the same rule — scaled from
  // the width they were measured at — and neither may take the text underneath
  // out of the reader's reach.
  it.each([
    ["the passage being asked about", { pending: MEASURED_MARK }, "pending-selection"],
    ["the passage a citation quoted", { cited: MEASURED_MARK }, "cited-passage"],
  ] as [string, Partial<ComponentProps<typeof HighlightOverlay>>, string][])(
    "draws %s scaled to the width the page is drawn at, without covering it",
    (_what, mark, testId) => {
      render(
        <HighlightOverlay
          highlights={[]}
          pageNumber={1}
          containerWidth={1200}
          containerHeight={1600}
          basePageWidth={400}
          onHighlightClick={() => {}}
          {...mark}
        />,
      );

      const [rect] = screen.getAllByTestId(testId);
      expect([rect.style.left, rect.style.top, rect.style.width, rect.style.height]).toStrictEqual([
        "20px",
        "40px",
        "200px",
        "24px",
      ]);
      expect(screen.queryByRole("button")).toBeNull();
    },
  );

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
    expect([rect.style.left, rect.style.top, rect.style.width, rect.style.height]).toStrictEqual([
      "20px",
      "40px",
      "200px",
      "24px",
    ]);
  });
});
