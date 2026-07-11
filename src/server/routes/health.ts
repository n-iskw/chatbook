import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { sql } from "drizzle-orm";

type Env = {
  Bindings: {
    DB: D1Database;
  };
};

export const healthRoute = new Hono<Env>().get("/health", async (c) => {
  const db = drizzle(c.env.DB);
  await db.get(sql`select 1`);
  return c.json({ status: "ok" });
});
