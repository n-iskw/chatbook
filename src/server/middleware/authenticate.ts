import { createMiddleware } from "hono/factory";
import { createRemoteJWKSet } from "jose";
import { verifyAccessToken, type AccessTokenClaims } from "../auth/verifyAccessToken";

type Env = {
  Bindings: {
    COGNITO_ISSUER: string;
    COGNITO_CLIENT_ID: string;
  };
  Variables: {
    auth: AccessTokenClaims;
  };
};

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJwks(issuer: string) {
  const cached = jwksCache.get(issuer);
  if (cached) return cached;
  const jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
  jwksCache.set(issuer, jwks);
  return jwks;
}

export const authenticate = createMiddleware<Env>(async (c, next) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: { code: "UNAUTHORIZED", message: "認証が必要です" } }, 401);
  }

  const token = authHeader.slice("Bearer ".length);
  const { COGNITO_ISSUER, COGNITO_CLIENT_ID } = c.env;

  try {
    const claims = await verifyAccessToken(token, {
      issuer: COGNITO_ISSUER,
      clientId: COGNITO_CLIENT_ID,
      getKey: getJwks(COGNITO_ISSUER),
    });
    c.set("auth", claims);
  } catch {
    return c.json({ error: { code: "UNAUTHORIZED", message: "トークンが無効です" } }, 401);
  }

  await next();
});
