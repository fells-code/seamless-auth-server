import { jest } from "@jest/globals";
import { exportJWK, generateKeyPair, SignJWT } from "jose";

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function createSignedAuthResponse(subject = "user-123") {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const jwk = await exportJWK(publicKey);
  jwk.alg = "RS256";
  jwk.kid = "test-key";
  jwk.use = "sig";

  const token = await new SignJWT({ sub: subject })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer("https://auth.example.com")
    .setSubject(subject)
    .setExpirationTime("5m")
    .sign(privateKey);

  return { token, jwk };
}

describe("loginHandler", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("returns sanitized login policy metadata and stores the pre-auth token in cookies", async () => {
    const { token, jwk } = await createSignedAuthResponse();

    global.fetch = jest.fn(async (url) => {
      if (url === "https://auth.example.com/login") {
        return jsonResponse(200, {
          message: "Success",
          identifierType: "email",
          loginMethods: ["passkey", "magic_link", "email_otp"],
          sub: "user-123",
          token,
          ttl: 300,
        });
      }

      if (url === "https://auth.example.com/.well-known/jwks.json") {
        return jsonResponse(200, { keys: [jwk] });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    const { loginHandler } = await import("../dist/handlers/login.js");

    const result = await loginHandler(
      { body: { identifier: "user@example.com", passkeyAvailable: true } },
      {
        authServerUrl: "https://auth.example.com",
        preAuthCookieName: "preauth",
      },
    );

    expect(result.status).toBe(200);
    expect(result.body).toEqual({
      message: "Success",
      identifierType: "email",
      loginMethods: ["passkey", "magic_link", "email_otp"],
    });
    expect(result.body).not.toHaveProperty("token");
    expect(result.setCookies).toEqual([
      {
        name: "preauth",
        value: { sub: "user-123", token },
        ttl: 300,
        domain: undefined,
      },
    ]);
  });
});
