import { Hono } from "hono";
import { healthRoute } from "./routes/health";
import { pdfRoute } from "./routes/pdf";

type Env = {
  Bindings: {
    DB: D1Database;
    DEEPSEEK_API_KEY: string;
  };
};

const app = new Hono<Env>().basePath("/api").route("/", healthRoute).route("/", pdfRoute);

export default app;
