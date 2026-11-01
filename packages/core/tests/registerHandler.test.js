import { jest } from "@jest/globals";
import { exportJWK, generateKeyPair, SignJWT } from "jose";

const AUTH = "https://register.example.com";

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const keys = generateKeyPair("RS256").then(async ({ privateKey, publicKey }) => {
  const jwk = await exportJWK(publicKey);
  Object.assign(jwk, { alg: "RS256", kid: "register-key", use: "sig" });
  return { privateKey, jwk };
});

async function sign(claims, issuer = AUTH) {
  const { privateKey } = await keys;
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: "register-key" })
    .setIssuer(issuer)
    .setSubject(claims.sub)
    .setExpirationTime("5m")
    .sign(privateKey);
}

async function mockRegister(body) {
  const { jwk } = await keys;
  global.fetch = jest.fn(async (url) => {
    if (url === `${AUTH}/registration/register`) {
      return jsonResponse(200, body);
    }
    if (url === `${AUTH}/.well-known/jwks.json`) {
      return jsonResponse(200, { keys: [jwk] });
    }
    throw new Error(`Unexpected fetch URL: ${url}`);
  });
}

async function registered(claims = { sub: "user-123", typ: "ephemeral" }) {
  return {
    message: "Success",
    sub: "user-123",
    token: await sign(claims),
    ttl: 300,
  };
}

const OPTS = { authServerUrl: AUTH, registrationCookieName: "registration" };

describe("registerHandler", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("stores the verified ephemeral token in the registration cookie", async () => {
    const { registerHandler } = await import("../dist/handlers/register.js");
    const body = await registered();
    await mockRegister(body);

    const result = await registerHandler(
      { body: { email: "user@example.com", phone: "+14155552671" } },
      OPTS,
    );

    expect(result.status).toBe(200);
    expect(result.setCookies).toEqual([
      {
        name: "registration",
        value: { sub: "user-123", token: body.token },
        ttl: 300,
        domain: undefined,
      },
    ]);
  });

  // The cookie holds the registration token. Returning it in the body as well
  // let page scripts read the token the httpOnly cookie exists to hide (#202).
  it("keeps the registration token out of a cookie-transport body", async () => {
    const { registerHandler } = await import("../dist/handlers/register.js");
    const body = await registered();
    await mockRegister(body);

    const result = await registerHandler({ body: { email: "user@example.com" } }, OPTS);

    expect(result.body).toEqual({ message: "Success", sub: "user-123", ttl: 300 });
    expect(result.setCookies[0].value.token).toBe(body.token);
  });

  it("returns the whole body in bearer transport", async () => {
    const { registerHandler } = await import("../dist/handlers/register.js");
    const body = await registered();
    await mockRegister(body);

    const result = await registerHandler(
      { body: { email: "user@example.com" } },
      { ...OPTS, transport: "bearer" },
    );

    expect(result.body).toEqual(body);
    expect(result.setCookies).toBeUndefined();
  });

  it.each([
    ["an unsigned token", async () => ({ ...(await registered()), token: "not-a-jwt" })],
    ["an access token", () => registered({ sub: "user-123", typ: "access" })],
    [
      "a token for another subject",
      async () => ({ ...(await registered()), sub: "someone-else" }),
    ],
    [
      "a token from another issuer",
      async () => ({
        ...(await registered()),
        token: await sign({ sub: "user-123", typ: "ephemeral" }, "https://evil.example.com"),
      }),
    ],
  ])("answers 502 and sets no cookie for %s", async (_label, build) => {
    const { registerHandler } = await import("../dist/handlers/register.js");
    await mockRegister(await build());

    for (const transport of [undefined, "bearer"]) {
      const result = await registerHandler(
        { body: { email: "user@example.com" } },
        { ...OPTS, transport },
      );

      expect(result).toEqual({ status: 502, errorCode: "invalid_upstream_session" });
    }
  });
});
