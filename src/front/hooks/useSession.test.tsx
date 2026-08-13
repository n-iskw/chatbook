import { describe, it, expect, afterEach, vi } from "vite-plus/test";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { useSession } from "./useSession";
import { SwrTestCache } from "../../test/swrTestCache";

function wrapper({ children }: { children: ReactNode }) {
  return <SwrTestCache>{children}</SwrTestCache>;
}

/** The server's answer to `GET /api/auth/session`. */
function serverSays(status: number, body: unknown): typeof fetch {
  return () =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
    );
}

describe("useSession", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reports the reader as signed in when the server says so", async () => {
    vi.stubGlobal("fetch", serverSays(200, { signedIn: true }));

    const { result } = renderHook(() => useSession(), { wrapper });

    await waitFor(() => expect(result.current.state).toBe("signed-in"));
  });

  it("reports a refusal as needing a password, which is what 401 means here", async () => {
    vi.stubGlobal(
      "fetch",
      serverSays(401, { error: { code: "UNAUTHORIZED", message: "ログインしてください" } }),
    );

    const { result } = renderHook(() => useSession(), { wrapper });

    await waitFor(() => expect(result.current.state).toBe("signed-out"));
  });

  it("keeps a server that is down apart from one that turned the reader away", async () => {
    // Told apart because they call for different things on screen: a password
    // box helps in one case and is a lie in the other.
    vi.stubGlobal(
      "fetch",
      serverSays(500, { error: { code: "INTERNAL_ERROR", message: "Unexpected server error" } }),
    );

    const { result } = renderHook(() => useSession(), { wrapper });

    await waitFor(() => expect(result.current.state).toBe("unknown"));
    // The whole answer, so the reason travels with the state rather than being
    // dropped where the screen would have shown it
    expect(result.current).toStrictEqual({
      state: "unknown",
      reason: "Unexpected server error",
    });
  });

  it("treats a request that never arrived as unknown rather than signed out", async () => {
    vi.stubGlobal("fetch", () => Promise.reject(new TypeError("Failed to fetch")));

    const { result } = renderHook(() => useSession(), { wrapper });

    await waitFor(() => expect(result.current.state).toBe("unknown"));
  });

  it("says nothing either way until the answer is in", () => {
    vi.stubGlobal("fetch", () => new Promise<Response>(() => {}));

    const { result } = renderHook(() => useSession(), { wrapper });

    expect(result.current.state).toBe("asking");
  });
});
