import { Hono } from "hono";
import { resolveLlmConfig } from "../services/llmService";
import type { ServerConfig } from "../../shared/schemas/config";

type Env = {
  Bindings: {
    LLM_API_KEY: string;
    LLM_WEB_SEARCH_SUPPORTED?: string;
  };
};

/**
 * What the screen has to know about this deploy to draw itself correctly.
 *
 * The settings menu offers web search, and a provider without a Responses API
 * has none to give. The server refuses such a request anyway
 * (`routes/pdf.ts`), but a switch that quietly does nothing is worse than no
 * switch at all, so the menu asks here whether to show it.
 */
export const configRoute = new Hono<Env>().get("/config", (c) => {
  const config: ServerConfig = {
    webSearchAvailable: resolveLlmConfig(c.env).webSearchSupported,
  };
  return c.json(config);
});
