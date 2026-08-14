import useSWR from "swr";
import { fetcher } from "../lib/fetcher";
import { serverConfigSchema, type ServerConfig } from "../../shared/schemas/config";

export const SERVER_CONFIG_KEY = "/api/config";

/**
 * What this deploy can do, for the parts of the screen whose shape depends on
 * it — currently only the web-search switch in the settings menu.
 *
 * Answered optimistically while the question is in flight or has failed: a
 * switch that appears a moment after the menu opens is a change the reader did
 * not ask for, and guessing wrong costs nothing, because the server turns a
 * request its provider cannot serve into an ordinary one (`routes/pdf.ts`).
 */
export function useServerConfig(): ServerConfig {
  const { data } = useSWR(SERVER_CONFIG_KEY, (url) => fetcher(url, serverConfigSchema));

  return data ?? { webSearchAvailable: true };
}
