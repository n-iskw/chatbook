import { describe, it, expect, afterEach, vi } from "vite-plus/test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RequireSession } from "./RequireSession";
import { SwrTestCache } from "../../test/swrTestCache";

const SHELF = "本棚の中身";

function renderGate() {
  return render(
    <SwrTestCache>
      <RequireSession>
        <p>{SHELF}</p>
      </RequireSession>
    </SwrTestCache>,
  );
}

/** A server that refuses until the right password arrives, then lets them in. */
function serverWithPassword(password: string) {
  let signedIn = false;
  const fetchFn = (url: string, init?: RequestInit) => {
    if (url.endsWith("/api/auth/login")) {
      // The gate only ever sends a JSON string here, which is what it is read as
      const sent = typeof init?.body === "string" ? init.body : "{}";
      const body = JSON.parse(sent) as { password: string };
      if (body.password !== password) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              error: { code: "UNAUTHORIZED", message: "ユーザー名かパスワードが違います" },
            }),
            { status: 401, headers: { "Content-Type": "application/json" } },
          ),
        );
      }
      signedIn = true;
      return Promise.resolve(new Response(JSON.stringify({ signedIn: true }), { status: 200 }));
    }

    return Promise.resolve(
      signedIn
        ? new Response(JSON.stringify({ signedIn: true }), { status: 200 })
        : new Response(
            JSON.stringify({ error: { code: "UNAUTHORIZED", message: "ログインしてください" } }),
            { status: 401, headers: { "Content-Type": "application/json" } },
          ),
    );
  };
  return fetchFn as unknown as typeof fetch;
}

describe("RequireSession", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("shows the reader's books once the server says they are signed in", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.resolve(new Response(JSON.stringify({ signedIn: true }), { status: 200 })),
    );

    renderGate();

    expect(await screen.findByText(SHELF)).toBeInTheDocument();
  });

  it("asks for a password instead when the server turns the reader away", async () => {
    vi.stubGlobal("fetch", serverWithPassword("open-sesame"));

    renderGate();

    expect(await screen.findByLabelText("パスワード")).toBeInTheDocument();
    expect(screen.queryByText(SHELF)).toBeNull();
  });

  it("opens the app on the password that works, without changing the address", async () => {
    // The gate stands in place rather than sending the reader to /login, so a
    // link into a page and a highlight survives having to sign in first.
    const before = window.location.href;
    vi.stubGlobal("fetch", serverWithPassword("open-sesame"));
    renderGate();
    await screen.findByLabelText("パスワード");

    await userEvent.type(screen.getByLabelText("ユーザー名"), "skanehira");
    await userEvent.type(screen.getByLabelText("パスワード"), "open-sesame");
    await userEvent.click(screen.getByRole("button", { name: "ログイン" }));

    expect(await screen.findByText(SHELF)).toBeInTheDocument();
    expect(window.location.href).toBe(before);
  });

  it("says the password was wrong and keeps the box open to try again", async () => {
    vi.stubGlobal("fetch", serverWithPassword("open-sesame"));
    renderGate();
    await screen.findByLabelText("パスワード");

    await userEvent.type(screen.getByLabelText("ユーザー名"), "skanehira");
    await userEvent.type(screen.getByLabelText("パスワード"), "wrong");
    await userEvent.click(screen.getByRole("button", { name: "ログイン" }));

    expect(await screen.findByText("ユーザー名かパスワードが違います")).toBeInTheDocument();
    expect(screen.getByLabelText("パスワード")).toBeInTheDocument();
  });

  it("says the server could not be reached rather than asking for a password", async () => {
    // A password box here would blame the reader for the server being down.
    vi.stubGlobal("fetch", () => Promise.reject(new TypeError("Failed to fetch")));

    renderGate();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "ログイン状態を確認できませんでした",
    );
    expect(screen.queryByLabelText("パスワード")).toBeNull();
  });
});
