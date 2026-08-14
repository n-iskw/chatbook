import { describe, it, expect, afterEach, vi } from "vite-plus/test";
import { renderHook, waitFor, act } from "@testing-library/react";
import type { ReactNode } from "react";
import { useServerConfig } from "./useServerConfig";
import { SwrTestCache } from "../../test/swrTestCache";

function wrapper({ children }: { children: ReactNode }) {
  return <SwrTestCache>{children}</SwrTestCache>;
}

/**
 * The server's answer to `GET /api/config`, and a way to wait for it.
 *
 * Counted rather than just stubbed because the hook answers optimistically
 * while it waits: a test that only asserted the optimistic value would pass
 * against a hook that never asked at all, and — where the optimistic value is
 * also the expected one — against one that read the answer wrongly.
 */
function serverSaying(status: number, body: unknown) {
  const asked = vi.fn(() =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
    ),
  );
  vi.stubGlobal("fetch", asked);
  return asked;
}

/** Let the answer land and the state it causes settle. */
async function answered(asked: ReturnType<typeof serverSaying>) {
  await waitFor(() => expect(asked).toHaveBeenCalledTimes(1));
  await act(async () => {
    await Promise.resolve();
  });
}

describe("useServerConfig", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("takes web search away once the server says its provider has none", async () => {
    const asked = serverSaying(200, { webSearchAvailable: false });

    const { result } = renderHook(() => useServerConfig(), { wrapper });
    await answered(asked);

    expect(result.current).toStrictEqual({ webSearchAvailable: false });
  });

  it("leaves web search in place when the server says its provider has it", async () => {
    const asked = serverSaying(200, { webSearchAvailable: true });

    const { result } = renderHook(() => useServerConfig(), { wrapper });
    await answered(asked);

    expect(result.current).toStrictEqual({ webSearchAvailable: true });
  });

  it("assumes web search is there while the answer is still on its way", async () => {
    // Assuming it is absent would take the switch out of the menu and put it
    // back a moment later, in front of a reader who had done nothing. The
    // server refuses a request it cannot serve, so guessing wrong costs
    // nothing.
    vi.stubGlobal("fetch", () => new Promise<Response>(() => {}));

    const { result } = renderHook(() => useServerConfig(), { wrapper });

    expect(result.current).toStrictEqual({ webSearchAvailable: true });
  });

  it("keeps the switch when the server answers with a failure of its own", async () => {
    const asked = serverSaying(500, {
      error: { code: "INTERNAL_ERROR", message: "Unexpected server error" },
    });

    const { result } = renderHook(() => useServerConfig(), { wrapper });
    await answered(asked);

    expect(result.current).toStrictEqual({ webSearchAvailable: true });
  });

  it("keeps the switch when the question never reached a server", async () => {
    // What an offline reader gets: `fetcher` does not wrap a rejected fetch, so
    // this arrives as a throw rather than as a refusal with a status on it.
    const asked = vi.fn(() => Promise.reject(new TypeError("Failed to fetch")));
    vi.stubGlobal("fetch", asked);

    const { result } = renderHook(() => useServerConfig(), { wrapper });
    await answered(asked);

    expect(result.current).toStrictEqual({ webSearchAvailable: true });
  });
});
