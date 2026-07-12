import { createMiddleware } from "hono/factory";
import { createRemoteJWKSet } from "jose";
import { verifyAccessToken, type AccessTokenClaims } from "../auth/verifyAccessToken";

type Env = {
  Bindings: {
    COGNITO_ISSUER: string;
    COGNITO_CLIENT_ID: string;
    COGNITO_JWKS_URL: string;
  };
  Variables: {
    auth: AccessTokenClaims;
  };
};

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export function resolveJwksUrl(issuer: string, jwksUrl: string | undefined): string {
  return jwksUrl ? jwksUrl : `${issuer}/.well-known/jwks.json`;
}

function getJwks(url: string) {
  const cached = jwksCache.get(url);
  if (cached) return cached;
  const jwks = createRemoteJWKSet(new URL(url));
  jwksCache.set(url, jwks);
  return jwks;
}

export const authenticate = createMiddleware<Env>(async (c, next) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: { code: "UNAUTHORIZED", message: "認証が必要です" } }, 401);
  }

  const token = authHeader.slice("Bearer ".length);
  const { COGNITO_ISSUER, COGNITO_CLIENT_ID, COGNITO_JWKS_URL } = c.env;
  const jwksUrl = resolveJwksUrl(COGNITO_ISSUER, COGNITO_JWKS_URL);

  try {
    const claims = await verifyAccessToken(token, {
      issuer: COGNITO_ISSUER,
      clientId: COGNITO_CLIENT_ID,
      getKey: getJwks(jwksUrl),
    });
    c.set("auth", claims);
  } catch {
    return c.json({ error: { code: "UNAUTHORIZED", message: "トークンが無効です" } }, 401);
  }

  await next();
});
