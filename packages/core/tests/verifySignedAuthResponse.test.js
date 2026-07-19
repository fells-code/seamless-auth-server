import { jest } from "@jest/globals";
import { exportJWK, generateKeyPair, SignJWT } from "jose";

const AUTH_SERVER_URL = "https://auth.example.com";

async function createSignedToken(audience, subject = "user-123") {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const jwk = await exportJWK(publicKey);
  jwk.alg = "RS256";
  jwk.kid = "test-key";
  jwk.use = "sig";

  const token = await new SignJWT({ sub: subject })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer(AUTH_SERVER_URL)
    .setAudience(audience)
    .setSubject(subject)
    .setExpirationTime("5m")
    .sign(privateKey);

  return { token, jwk };
}

function mockJwks(jwk) {
  global.fetch = jest.fn(async (url) => {
    if (url.toString() === `${AUTH_SERVER_URL}/.well-known/jwks.json`) {
      return new Response(JSON.stringify({ keys: [jwk] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  });
}

describe("verifySignedAuthResponse", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("returns the payload when the audience matches", async () => {
    const { token, jwk } = await createSignedToken("app-a");
    mockJwks(jwk);

    const { verifySignedAuthResponse } = await import(
      "../dist/verifySignedAuthResponse.js"
    );

    const payload = await verifySignedAuthResponse(
      token,
      AUTH_SERVER_URL,
      "app-a",
    );

    expect(payload).not.toBeNull();
    expect(payload.sub).toBe("user-123");
    expect(payload.aud).toBe("app-a");
  });

  it("returns null when the audience does not match", async () => {
    const { token, jwk } = await createSignedToken("app-a");
    mockJwks(jwk);

    const { verifySignedAuthResponse } = await import(
      "../dist/verifySignedAuthResponse.js"
    );

    const payload = await verifySignedAuthResponse(
      token,
      AUTH_SERVER_URL,
      "app-b",
    );

    expect(payload).toBeNull();
  });
});
