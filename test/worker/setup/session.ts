import { env, exports } from "cloudflare:workers";
import { SESSION_COOKIE, issueSession } from "../../../src/server/auth/session";

/**
 * The API as a signed-in reader sees it.
 *
 * Every endpoint but health and login needs the cookie, and these tests are
 * about what the endpoints do rather than about the guard in front of them —
 * so the cookie is added here once instead of at each of the calls. The guard
 * itself is what `auth.test.ts` is for, and that one calls `exports.default`
 * directly so it can arrive without a session.
 */
export async function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const token = await issueSession(env.AUTH_SESSION_SECRET, Date.now());
  const headers = new Headers(init.headers);
  headers.set("Cookie", `${SESSION_COOKIE}=${token}`);
  return exports.default.fetch(url, { ...init, headers });
}
