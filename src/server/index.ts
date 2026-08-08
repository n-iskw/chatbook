import { Hono } from "hono";
import { healthRoute } from "./routes/health";
import { pdfRoute } from "./routes/pdf";
import { applyMigrations } from "./db/migrate";

type Env = {
  Bindings: {
    DB: D1Database;
    DEEPSEEK_API_KEY: string;
  };
};

// Apply migrations at module init (runs once per Worker cold start).
// Module-level flag `migrated` prevents re-execution on subsequent requests.
// SQL uses IF NOT EXISTS for safety.
let migrationPromise: Promise<void> | null = null;

const app = new Hono<Env>()
  .basePath("/api")
  .use("*", async (c, next) => {
    // Trigger migration once, block first request until complete
    if (!migrationPromise) {
      migrationPromise = applyMigrations(c.env.DB);
    }
    await migrationPromise;
    await next();
  })
  .route("/", healthRoute)
  .route("/", pdfRoute);

export default app;
