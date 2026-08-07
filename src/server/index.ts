import { Hono } from "hono";
import { healthRoute } from "./routes/health";

type Env = {
  Bindings: {
    DB: D1Database;
    DEEPSEEK_API_KEY: string;
  };
};

const app = new Hono<Env>().basePath("/api").route("/", healthRoute);

export default app;
