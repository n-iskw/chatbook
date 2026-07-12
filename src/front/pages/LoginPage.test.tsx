import { describe, it, expect, vi, beforeEach } from "vite-plus/test";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { LoginPage } from "./LoginPage";
import { signIn } from "../lib/cognitoClient";

vi.mock("../lib/cognitoClient", () => ({
  signIn: vi.fn(),
}));

function renderLoginPage() {
  const router = createMemoryRouter(
    [
      { path: "/login", element: <LoginPage /> },
      { path: "/mypage", element: <p data-testid="mypage-stub">MyPage</p> },
    ],
    { initialEntries: ["/login"] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

describe("LoginPage", () => {
  beforeEach(() => {
    vi.mocked(signIn).mockReset();
  });

  it("navigates to /mypage after a successful sign-in", async () => {
    vi.mocked(signIn).mockResolvedValue({
      accessToken: "fake-access-token",
      email: "test@example.com",
    });

    const user = userEvent.setup();
    renderLoginPage();

    await user.type(screen.getByPlaceholderText("email"), "test@example.com");
    await user.type(screen.getByPlaceholderText("password"), "Passw0rd1!");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByTestId("mypage-stub")).toBeInTheDocument();
  });

  it("shows an error message when sign-in fails", async () => {
    vi.mocked(signIn).mockRejectedValue(new Error("Incorrect username or password."));

    const user = userEvent.setup();
    renderLoginPage();

    await user.type(screen.getByPlaceholderText("email"), "test@example.com");
    await user.type(screen.getByPlaceholderText("password"), "wrong-password");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() =>
      expect(screen.getByTestId("sign-in-error")).toHaveTextContent(
        "Incorrect username or password.",
      ),
    );
  });
});
