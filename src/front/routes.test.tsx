import { describe, it, expect, vi, beforeEach } from "vite-plus/test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SWRConfig } from "swr";
import { createMemoryRouter, RouterProvider } from "react-router";
import { LoginPage } from "./pages/LoginPage";
import { MyPage } from "./pages/MyPage";
import { RequireAuth } from "./components/RequireAuth";
import { signIn, getCurrentSession } from "./lib/cognitoClient";

vi.mock("./lib/cognitoClient", () => ({
  signIn: vi.fn(),
  getCurrentSession: vi.fn(),
}));

function renderApp() {
  const router = createMemoryRouter(
    [
      { path: "/login", element: <LoginPage /> },
      {
        path: "/mypage",
        element: (
          <RequireAuth>
            <MyPage />
          </RequireAuth>
        ),
      },
    ],
    { initialEntries: ["/mypage"] },
  );
  render(
    <SWRConfig value={{ provider: () => new Map() }}>
      <RouterProvider router={router} />
    </SWRConfig>,
  );
}

describe("auth flow across routes", () => {
  beforeEach(() => {
    vi.mocked(signIn).mockReset();
    vi.mocked(getCurrentSession).mockReset();
  });

  it("reaches /mypage after signing in, even after an earlier unauthenticated visit to /mypage cached no session", async () => {
    let authenticated = false;
    const session = { accessToken: "fake-access-token", email: "test@example.com" };
    vi.mocked(getCurrentSession).mockImplementation(() =>
      Promise.resolve(authenticated ? session : null),
    );
    vi.mocked(signIn).mockImplementation(async () => {
      authenticated = true;
      return session;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ sub: "user-123" }),
      } as Response),
    );

    renderApp();

    // 未ログインなので /mypage への直接アクセスは /login にリダイレクトされる
    expect(await screen.findByPlaceholderText("email")).toBeInTheDocument();

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("email"), "test@example.com");
    await user.type(screen.getByPlaceholderText("password"), "Passw0rd1!");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByText("test@example.com")).toBeInTheDocument();
    expect(await screen.findByText("user-123")).toBeInTheDocument();
  });
});
