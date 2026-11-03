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

  // The security half of #259: keys served at the root of a shared host must not
  // verify tokens for an auth server mounted under a prefix.
  it("does not trust keys served at the host root", async () => {
    const { verifyWithAuthServerJwks } = await import("../dist/jwks.js");
    const apiKeys = await generateKeyPair("RS256");
    const rootKeys = await generateKeyPair("RS256");
    const apiJwk = {
      ...(await exportJWK(apiKeys.publicKey)),
      alg: "RS256",
      kid: "k1",
    };
    const rootJwk = {
      ...(await exportJWK(rootKeys.publicKey)),
      alg: "RS256",
      kid: "k1",
    };
    const forged = await new SignJWT({ sub: "attacker" })
      .setProtectedHeader({ alg: "RS256", kid: "k1" })
      .setExpirationTime("5m")
      .sign(rootKeys.privateKey);

    global.fetch = jest.fn(async (url) => {
      const keys = {
        "https://shared.example.com/.well-known/jwks.json": [rootJwk],
        "https://shared.example.com/tenant-api/.well-known/jwks.json": [apiJwk],
      }[url.toString()];
      return new Response(JSON.stringify({ keys: keys ?? [] }), {
        status: keys ? 200 : 404,
        headers: { "Content-Type": "application/json" },
      });
    });

    await expect(
      verifyWithAuthServerJwks(
        forged,
        "https://shared.example.com/tenant-api",
        {},
      ),
    ).rejects.toThrow();
    expect(
      global.fetch.mock.calls.map(([url]) => url.toString()),
    ).not.toContain("https://shared.example.com/.well-known/jwks.json");
  });
});
