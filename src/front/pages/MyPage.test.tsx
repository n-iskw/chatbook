import { describe, it, expect, vi, beforeEach } from "vite-plus/test";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SWRConfig } from "swr";
import { createMemoryRouter, RouterProvider } from "react-router";
import { MyPage } from "./MyPage";
import { getCurrentSession, signOut } from "../lib/cognitoClient";

vi.mock("../lib/cognitoClient", () => ({
  getCurrentSession: vi.fn(),
  signOut: vi.fn(),
}));

function renderWithFreshSWRCache() {
  const router = createMemoryRouter(
    [
      { path: "/mypage", element: <MyPage /> },
      { path: "/login", element: <p data-testid="login-stub">Login</p> },
    ],
    { initialEntries: ["/mypage"] },
  );
  return render(
    <SWRConfig value={{ provider: () => new Map() }}>
      <RouterProvider router={router} />
    </SWRConfig>,
  );
}

describe("MyPage", () => {
  beforeEach(() => {
    vi.mocked(getCurrentSession).mockReset();
    vi.mocked(signOut).mockReset();
  });

  it("shows the signed-in user's sub and email", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue({
      accessToken: "fake-access-token",
      email: "test@example.com",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ sub: "user-123" }),
      } as Response),
    );

    renderWithFreshSWRCache();

    await waitFor(() => expect(screen.getByTestId("my-sub")).toHaveTextContent("user-123"));
    expect(screen.getByTestId("my-email")).toHaveTextContent("test@example.com");
  });

  it("signs out and navigates to /login when the sign-out button is clicked", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue({
      accessToken: "fake-access-token",
      email: "test@example.com",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ sub: "user-123" }),
      } as Response),
    );

    const user = userEvent.setup();
    renderWithFreshSWRCache();

    await user.click(await screen.findByRole("button", { name: /sign out/i }));

    expect(signOut).toHaveBeenCalled();
    expect(await screen.findByTestId("login-stub")).toBeInTheDocument();
  });
});
