import { jest } from "@jest/globals";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import jwt from "jsonwebtoken";

const { authenticateBearer, authenticateRequest } = await import(
  "../dist/guards.js"
);

const COOKIE_SECRET = "cookie-secret-cookie-secret-cookie-secret";

const { privateKey, publicKey } = await generateKeyPair("RS256");
const jwk = { ...(await exportJWK(publicKey)), alg: "RS256", kid: "k1", use: "sig" };

let serverCount = 0;
function nextServer() {
  serverCount += 1;
  return `https://guard-${serverCount}.example.com`;
}

function mockJwks(authServerUrl) {
  global.fetch = jest.fn(async (url) => {
    if (url.toString() === `${authServerUrl}/.well-known/jwks.json`) {
      return new Response(JSON.stringify({ keys: [jwk] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    throw new Error(`Unexpected fetch URL: ${url}`);
  });
}

async function accessToken(authServerUrl, overrides = {}) {
  return new SignJWT({
    sub: "user-123",
    typ: "access",
    sid: "session-1",
    roles: ["athlete", "coach"],
    ...overrides,
  })
    .setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setIssuer(authServerUrl)
    .setAudience(authServerUrl)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);
}

describe("authenticateBearer", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("maps a verified access token onto the session shape", async () => {
    const server = nextServer();
    mockJwks(server);
    const token = await accessToken(server);

    const result = await authenticateBearer({
      authorization: `Bearer ${token}`,
      authServerUrl: server,
      audience: server,
    });

    expect(result.rejection).toBeUndefined();
    expect(result.user).toMatchObject({
      id: "user-123",
      roles: ["athlete", "coach"],
      token,
    });
    expect(typeof result.user.iat).toBe("number");
    expect(typeof result.user.exp).toBe("number");
    // The access token carries no profile; hydration is getSeamlessUser's job.
    expect(result.user.email).toBeUndefined();
    expect(result.user.phone).toBeUndefined();
  });

  it("defaults roles to an empty list when the token carries none", async () => {
    const server = nextServer();
    mockJwks(server);

    const result = await authenticateBearer({
      authorization: `Bearer ${await accessToken(server, { roles: undefined })}`,
      authServerUrl: server,
      audience: server,
    });

    expect(result.user.roles).toEqual([]);
  });

  it("rejects a missing header as a missing token, with a warning", async () => {
    const server = nextServer();

    const result = await authenticateBearer({
      authorization: undefined,
      authServerUrl: server,
      audience: server,
    });

    expect(result.rejection).toMatchObject({
      status: 401,
      errorCode: "Failed to find authentication token required",
    });
    expect(result.rejection.warn).toMatch(/bearer/i);
  });

  it("rejects another scheme as a missing token", async () => {
    const server = nextServer();

    const result = await authenticateBearer({
      authorization: "Basic dXNlcjpwYXNz",
      authServerUrl: server,
      audience: server,
    });

    expect(result.rejection.status).toBe(401);
    expect(result.rejection.errorCode).toBe(
      "Failed to find authentication token required",
    );
  });

  it("rejects an ephemeral token as an invalid session", async () => {
    const server = nextServer();
    mockJwks(server);

    const result = await authenticateBearer({
      authorization: `Bearer ${await accessToken(server, { typ: "ephemeral" })}`,
      authServerUrl: server,
      audience: server,
    });

    expect(result.rejection).toEqual({
      status: 401,
      errorCode: "Invalid or expired session",
    });
  });

  it("rejects a token for another audience", async () => {
    const server = nextServer();
    mockJwks(server);

    const result = await authenticateBearer({
      authorization: `Bearer ${await accessToken(server)}`,
      authServerUrl: server,
      audience: "https://someone-else.example.com",
    });

    expect(result.rejection.errorCode).toBe("Invalid or expired session");
  });
});

describe("authenticateRequest", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  function cookie(payload) {
    return jwt.sign(payload, COOKIE_SECRET, {
      algorithm: "HS256",
      expiresIn: "300s",
    });
  }

  it("behaves exactly like authenticateCookie when bearer is not configured", async () => {
    const withCookie = await authenticateRequest({
      token: cookie({ sub: "user-1", token: "inner" }),
      cookieSecret: COOKIE_SECRET,
      authorization: "Bearer ignored",
    });
    expect(withCookie.user).toMatchObject({ id: "user-1", token: "inner" });

    const withoutCookie = await authenticateRequest({
      token: undefined,
      cookieSecret: COOKIE_SECRET,
      authorization: "Bearer ignored",
    });
    expect(withoutCookie.rejection).toMatchObject({
      status: 401,
      errorCode: "Failed to find authentication token required",
      warn: "Missing expected auth cookie.",
    });
  });

  it("prefers the cookie when both are present, even an invalid one", async () => {
    const server = nextServer();
    mockJwks(server);

    const result = await authenticateRequest({
      token: "not-a-cookie-jwt",
      cookieSecret: COOKIE_SECRET,
      authorization: `Bearer ${await accessToken(server)}`,
      bearer: { authServerUrl: server, audience: server },
    });

    expect(result.rejection).toEqual({
      status: 401,
      errorCode: "Invalid or expired session",
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("falls back to the bearer token when there is no cookie", async () => {
    const server = nextServer();
    mockJwks(server);
    const token = await accessToken(server);

    const result = await authenticateRequest({
      token: undefined,
      cookieSecret: COOKIE_SECRET,
      authorization: `Bearer ${token}`,
      bearer: { authServerUrl: server, audience: server },
    });

    expect(result.user).toMatchObject({ id: "user-123", token });
  });

  it("names both credentials in the warning when neither is present", async () => {
    const server = nextServer();

    const result = await authenticateRequest({
      token: undefined,
      cookieSecret: COOKIE_SECRET,
      authorization: undefined,
      bearer: { authServerUrl: server, audience: server },
    });

    expect(result.rejection.status).toBe(401);
    expect(result.rejection.warn).toMatch(/cookie/i);
    expect(result.rejection.warn).toMatch(/bearer/i);
  });

  it("still enforces cookie secret strength on the bearer path", async () => {
    const server = nextServer();

    await expect(
      authenticateRequest({
        token: undefined,
        cookieSecret: "short",
        authorization: `Bearer ${await accessToken(server)}`,
        bearer: { authServerUrl: server, audience: server },
      }),
    ).rejects.toThrow(/cookieSecret/);
  });
});
