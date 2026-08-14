import { describe, it, expect } from "vite-plus/test";
import { env, exports } from "cloudflare:workers";
import app from "../../src/server/index";
import { SESSION_COOKIE, issueSession } from "../../src/server/auth/session";

const CONFIG = "https://example.com/api/config";

/** The reply as a signed-in reader sees it, under the given bindings. */
async function readConfig(overrides: Record<string, string> = {}): Promise<Response> {
  const token = await issueSession(env.AUTH_SESSION_SECRET, Date.now());
  return app.request(
    CONFIG,
    { headers: { Cookie: `${SESSION_COOKIE}=${token}` } },
    {
      ...env,
      ...overrides,
    },
  );
}

describe("GET /api/config", () => {
  it("says web search is there when the deploy names no provider of its own", async () => {
    // Nothing set means DeepSeek, which has the Responses API this uses.
    const response = await readConfig();

    expect(response.status).toBe(200);
    expect(await response.json()).toStrictEqual({ webSearchAvailable: true });
  });

  it("says web search is gone when the deploy declares its provider has none", async () => {
    // This is what takes the switch out of the settings menu, so a reader is
    // not offered something the provider cannot do.
    const response = await readConfig({ LLM_WEB_SEARCH_SUPPORTED: "false" });

    expect(response.status).toBe(200);
    expect(await response.json()).toStrictEqual({ webSearchAvailable: false });
  });

  it("tells no one what this server runs before they have signed in", async () => {
    const response = await exports.default.fetch(CONFIG);

    expect(response.status).toBe(401);
  });
});
