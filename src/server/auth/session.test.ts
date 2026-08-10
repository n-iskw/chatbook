import { describe, it, expect } from "vite-plus/test";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_MS,
  clearedSessionCookie,
  issueSession,
  readSessionCookie,
  verifySession,
} from "./session";

const SECRET = "a-secret-only-the-server-knows";
const NOW = Date.parse("2026-08-10T00:00:00.000Z");

describe("issueSession / verifySession", () => {
  it("accepts back the session it just issued", async () => {
    const token = await issueSession(SECRET, NOW);

    expect(await verifySession(token, SECRET, NOW)).toBe(true);
  });

  it("refuses a session signed with another secret, so the token cannot be forged", async () => {
    const token = await issueSession("someone-elses-secret", NOW);

    expect(await verifySession(token, SECRET, NOW)).toBe(false);
  });

  it("refuses a session whose expiry was edited to buy more time", async () => {
    const token = await issueSession(SECRET, NOW);
    const [, signature] = token.split(".");
    const forged = `${NOW + SESSION_MAX_AGE_MS * 10}.${signature}`;

    expect(await verifySession(forged, SECRET, NOW)).toBe(false);
  });

  it("refuses a session once its time is up", async () => {
    const token = await issueSession(SECRET, NOW);

    expect(await verifySession(token, SECRET, NOW + SESSION_MAX_AGE_MS + 1)).toBe(false);
  });

  it("still accepts a session on its last moment", async () => {
    const token = await issueSession(SECRET, NOW);

    expect(await verifySession(token, SECRET, NOW + SESSION_MAX_AGE_MS)).toBe(true);
  });

  it("refuses anything that is not a session at all", async () => {
    expect(await verifySession("", SECRET, NOW)).toBe(false);
    expect(await verifySession("not-a-token", SECRET, NOW)).toBe(false);
    expect(await verifySession(`${NOW}.`, SECRET, NOW)).toBe(false);
  });
});

describe("readSessionCookie", () => {
  it("picks its own cookie out of the ones the browser sent", () => {
    const header = `other=1; ${SESSION_COOKIE}=abc.def; another=2`;

    expect(readSessionCookie(header)).toBe("abc.def");
  });

  it("finds nothing when the browser sent no cookies at all", () => {
    expect(readSessionCookie(null)).toBeNull();
  });

  it("finds nothing when the browser sent other cookies but not this one", () => {
    expect(readSessionCookie("other=1; another=2")).toBeNull();
  });

  it("does not mistake a cookie whose name merely ends the same way", () => {
    expect(readSessionCookie(`not_${SESSION_COOKIE}=abc.def`)).toBeNull();
  });
});

describe("clearedSessionCookie", () => {
  it("expires the cookie rather than leaving the browser to forget it", () => {
    const header = clearedSessionCookie();

    expect(header).toContain(`${SESSION_COOKIE}=;`);
    expect(header).toContain("Max-Age=0");
    expect(header).toContain("HttpOnly");
  });
});
