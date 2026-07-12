import { describe, it, expect } from "vitest";
import { resolveJwksUrl } from "../../src/server/middleware/authenticate";

describe("resolveJwksUrl", () => {
  it("uses COGNITO_JWKS_URL when it is set", () => {
    expect(resolveJwksUrl("https://issuer.example.com", "https://jwks.example.com/keys.json")).toBe(
      "https://jwks.example.com/keys.json",
    );
  });

  it("falls back to {issuer}/.well-known/jwks.json when COGNITO_JWKS_URL is an empty string", () => {
    expect(resolveJwksUrl("https://issuer.example.com", "")).toBe(
      "https://issuer.example.com/.well-known/jwks.json",
    );
  });

  it("falls back to {issuer}/.well-known/jwks.json when COGNITO_JWKS_URL is undefined", () => {
    expect(resolveJwksUrl("https://issuer.example.com", undefined)).toBe(
      "https://issuer.example.com/.well-known/jwks.json",
    );
  });
});
