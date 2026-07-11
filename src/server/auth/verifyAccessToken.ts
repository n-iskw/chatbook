import { jwtVerify, type JWTVerifyGetKey } from "jose";

export type AccessTokenClaims = {
  sub: string;
  client_id: string;
  token_use: "access";
  exp: number;
};

export type VerifyAccessTokenOptions = {
  issuer: string;
  clientId: string;
  getKey: JWTVerifyGetKey;
};

export async function verifyAccessToken(
  token: string,
  { issuer, clientId, getKey }: VerifyAccessTokenOptions,
): Promise<AccessTokenClaims> {
  const { payload } = await jwtVerify(token, getKey, { issuer });

  if (payload.token_use !== "access") {
    throw new Error(`unexpected token_use: ${String(payload.token_use)}`);
  }
  if (payload.client_id !== clientId) {
    throw new Error("client_id mismatch");
  }

  return {
    sub: payload.sub as string,
    client_id: payload.client_id as string,
    token_use: "access",
    exp: payload.exp as number,
  };
}
