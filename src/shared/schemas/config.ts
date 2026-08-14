import { z } from "zod";

/**
 * What this server can do, as the screen needs to know it.
 *
 * Only what changes the shape of the UI belongs here — the endpoint is behind
 * the session, but it is still the reader's browser being told what the
 * deploy runs, so the provider's name, its model and its key stay server-side.
 */
export const serverConfigSchema = z.object({
  /** Whether the assistant can be asked to search the web (`LLM_WEB_SEARCH_SUPPORTED`). */
  webSearchAvailable: z.boolean(),
});

export type ServerConfig = z.infer<typeof serverConfigSchema>;
