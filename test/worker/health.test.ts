import { describe, it, expect } from "vitest";
import { env, applyD1Migrations, SELF } from "cloudflare:test";

describe("GET /api/health", () => {
  it("returns ok once the D1 migration has been applied", async () => {
    await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);

    const response = await SELF.fetch("https://example.com/api/health");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });
});
