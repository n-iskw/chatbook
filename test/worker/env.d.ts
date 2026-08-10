import type { D1Migration } from "@cloudflare/vitest-pool-workers/config";

declare global {
  namespace Cloudflare {
    interface Env {
      TEST_MIGRATIONS: D1Migration[];
      // Injected by vitest.workers.config.ts. Declared here because
      // `wrangler types` only sees what .dev.vars and wrangler.jsonc declare,
      // and these exist only for the tests.
      AUTH_USERNAME: string;
      AUTH_PASSWORD: string;
      AUTH_SESSION_SECRET: string;
    }
  }
}
