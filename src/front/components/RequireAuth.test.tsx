import { describe, it, expect, vi, beforeEach } from "vite-plus/test";
import { render, screen } from "@testing-library/react";
import { SWRConfig } from "swr";
import { createMemoryRouter, RouterProvider } from "react-router";
import { RequireAuth } from "./RequireAuth";
import { getCurrentSession } from "../lib/cognitoClient";

vi.mock("../lib/cognitoClient", () => ({
  getCurrentSession: vi.fn(),
}));

function renderWithRouter() {
  const router = createMemoryRouter(
    [
      {
        path: "/mypage",
        element: (
          <SWRConfig value={{ provider: () => new Map() }}>
            <RequireAuth>
              <p data-testid="protected-content">Protected</p>
            </RequireAuth>
          </SWRConfig>
        ),
      },
      { path: "/login", element: <p data-testid="login-stub">Login</p> },
    ],
    { initialEntries: ["/mypage"] },
  );
  render(<RouterProvider router={router} />);
}

describe("RequireAuth", () => {
  beforeEach(() => {
    vi.mocked(getCurrentSession).mockReset();
  });

  it("renders children when a session exists", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue({
      accessToken: "token",
      email: "test@example.com",
    });

    renderWithRouter();

    expect(await screen.findByTestId("protected-content")).toBeInTheDocument();
  });

  it("redirects to /login when no session exists", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(null);

    renderWithRouter();

    expect(await screen.findByTestId("login-stub")).toBeInTheDocument();
  });
});
