import { describe, it, expect, vi, beforeEach } from "vite-plus/test";
import { render, screen, waitFor } from "@testing-library/react";
import { SWRConfig } from "swr";
import { HomePage } from "./HomePage";

function renderWithFreshSWRCache() {
  return render(
    <SWRConfig value={{ provider: () => new Map() }}>
      <HomePage />
    </SWRConfig>,
  );
}

describe("HomePage", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: "ok" }),
      } as Response),
    );
  });

  it("renders the placeholder heading when mounted", () => {
    renderWithFreshSWRCache();
    expect(
      screen.getByRole("heading", { name: /Hello, fullstack-worker-template/i }),
    ).toBeInTheDocument();
  });

  it("shows ok once the /api/health check resolves successfully", async () => {
    renderWithFreshSWRCache();
    await waitFor(() =>
      expect(screen.getByTestId("api-health-status")).toHaveTextContent("API status: ok"),
    );
  });
});
