import { describe, it, expect, vi, beforeEach } from "vite-plus/test";
import { render, screen, waitFor } from "@testing-library/react";
import { HomePage } from "./HomePage";

describe("HomePage", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true } as Response));
  });

  it("renders the placeholder heading when mounted", () => {
    render(<HomePage />);
    expect(
      screen.getByRole("heading", { name: /Hello, fullstack-worker-template/i }),
    ).toBeInTheDocument();
  });

  it("shows ok once the /api/health check resolves successfully", async () => {
    render(<HomePage />);
    await waitFor(() =>
      expect(screen.getByTestId("api-health-status")).toHaveTextContent("API status: ok"),
    );
  });
});
