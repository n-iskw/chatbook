import { describe, it, expect, vi, beforeEach } from "vite-plus/test";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SWRConfig } from "swr";
import { LoginPage } from "./LoginPage";
import { signIn } from "../lib/cognitoClient";

vi.mock("../lib/cognitoClient", () => ({
  signIn: vi.fn(),
}));

function renderWithFreshSWRCache() {
  return render(
    <SWRConfig value={{ provider: () => new Map() }}>
      <LoginPage />
    </SWRConfig>,
  );
}

describe("LoginPage", () => {
  beforeEach(() => {
    vi.mocked(signIn).mockReset();
  });

  it("shows the signed-in user's sub after a successful sign-in", async () => {
    vi.mocked(signIn).mockResolvedValue("fake-access-token");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ sub: "user-123" }),
      } as Response),
    );

    const user = userEvent.setup();
    renderWithFreshSWRCache();

    await user.type(screen.getByPlaceholderText("email"), "test@example.com");
    await user.type(screen.getByPlaceholderText("password"), "Passw0rd1!");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() =>
      expect(screen.getByTestId("me-sub")).toHaveTextContent("Signed in as: user-123"),
    );
  });

  it("shows an error message when sign-in fails", async () => {
    vi.mocked(signIn).mockRejectedValue(new Error("Incorrect username or password."));

    const user = userEvent.setup();
    renderWithFreshSWRCache();

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
