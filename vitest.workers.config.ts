import path from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vite-plus";

export default defineConfig({
  plugins: [
    cloudflareTest(async () => {
      const migrationsPath = path.join(__dirname, "migrations");
      const migrations = await readD1Migrations(migrationsPath);

      return {
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            // MSW covers every upstream call, so the key only has to exist.
            // Without it the chat route short-circuits with a 500 wherever
            // .dev.vars is absent, such as CI.
            LLM_API_KEY: "test-key",
            // The guard refuses everything when these are missing, so without
            // them every test here would be checking the same 401.
            AUTH_USERNAME: "test-user",
            AUTH_PASSWORD: "test-password",
            AUTH_SESSION_SECRET: "test-session-secret",
          },
        },
      };
    }),
  ],
  test: {
    include: ["test/worker/**/*.test.ts"],
    setupFiles: ["./test/worker/setup/msw.ts"],
  },
});
