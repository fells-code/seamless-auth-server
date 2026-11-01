import { jest } from "@jest/globals";
import { exportJWK, generateKeyPair, SignJWT } from "jose";

describe("auth server JWKS", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  // Resolving "/.well-known/jwks.json" against the URL dropped the path, so an
  // API mounted under a prefix had its keys fetched from the bare origin.
  it.each([
    ["https://a.example.com/auth-api", "https://a.example.com/auth-api"],
    ["https://b.example.com/auth-api/", "https://b.example.com/auth-api"],
  ])("keeps the path prefix of %s", async (authServerUrl, base) => {
    const { verifyWithAuthServerJwks } = await import("../dist/jwks.js");
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const jwk = { ...(await exportJWK(publicKey)), alg: "RS256", kid: "k1" };
    const token = await new SignJWT({ sub: "user-123" })
      .setProtectedHeader({ alg: "RS256", kid: "k1" })
      .setExpirationTime("5m")
      .sign(privateKey);

    global.fetch = jest.fn(async (url) => {
      if (url.toString() === `${base}/.well-known/jwks.json`) {
        return new Response(JSON.stringify({ keys: [jwk] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    const payload = await verifyWithAuthServerJwks(token, authServerUrl, {});

    expect(payload.sub).toBe("user-123");
  });
});
