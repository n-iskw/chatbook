import { Hono } from "hono";
import { healthRoute } from "./routes/health";
import { meRoute } from "./routes/me";

type Env = {
  Bindings: {
    DB: D1Database;
    COGNITO_ISSUER: string;
    COGNITO_CLIENT_ID: string;
    COGNITO_JWKS_URL: string;
  };
};

const app = new Hono<Env>().basePath("/api").route("/", healthRoute).route("/", meRoute);

export default app;
