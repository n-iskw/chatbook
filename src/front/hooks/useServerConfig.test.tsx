import { describe, it, expect, afterEach, vi } from "vite-plus/test";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { useServerConfig } from "./useServerConfig";
import { SwrTestCache } from "../../test/swrTestCache";

function wrapper({ children }: { children: ReactNode }) {
  return <SwrTestCache>{children}</SwrTestCache>;
}

/** The server's answer to `GET /api/config`. */
function serverSays(status: number, body: unknown): typeof fetch {
  return () =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
    );
}

describe("useServerConfig", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("takes web search away once the server says its provider has none", async () => {
    vi.stubGlobal("fetch", serverSays(200, { webSearchAvailable: false }));

    const { result } = renderHook(() => useServerConfig(), { wrapper });

    await waitFor(() => expect(result.current).toStrictEqual({ webSearchAvailable: false }));
  });

  it("leaves web search in place when the server says its provider has it", async () => {
    vi.stubGlobal("fetch", serverSays(200, { webSearchAvailable: true }));

    const { result } = renderHook(() => useServerConfig(), { wrapper });

    await waitFor(() => expect(result.current).toStrictEqual({ webSearchAvailable: true }));
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

  it("keeps the switch when the question could not be asked at all", async () => {
    vi.stubGlobal(
      "fetch",
      serverSays(500, { error: { code: "INTERNAL_ERROR", message: "Unexpected server error" } }),
    );

    const { result } = renderHook(() => useServerConfig(), { wrapper });

    await waitFor(() => expect(result.current).toStrictEqual({ webSearchAvailable: true }));
  });
});
