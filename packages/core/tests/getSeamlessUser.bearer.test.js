import { jest } from "@jest/globals";
import { exportJWK, generateKeyPair, SignJWT } from "jose";

const { getSeamlessUser } = await import("../dist/getSeamlessUser.js");

const COOKIE_SECRET = "cookie-secret-cookie-secret-cookie-secret";
const USER = {
  id: "user-123",
  email: "user@example.com",
  phone: null,
  roles: ["athlete"],
  lastLogin: null,
  activeOrganizationId: null,
};

const { privateKey, publicKey } = await generateKeyPair("RS256");
const jwk = { ...(await exportJWK(publicKey)), alg: "RS256", kid: "k1", use: "sig" };

let serverCount = 0;
function nextServer() {
  serverCount += 1;
  return `https://me-${serverCount}.example.com`;
}

// Serves the JWKS and records the /users/me call so the test can inspect it.
function mockAuthServer(authServerUrl, { meStatus = 200 } = {}) {
  const calls = [];
  global.fetch = jest.fn(async (url, init) => {
    const href = url.toString();
    if (href === `${authServerUrl}/.well-known/jwks.json`) {
      return new Response(JSON.stringify({ keys: [jwk] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (href === `${authServerUrl}/users/me`) {
      calls.push(init);
      return {
        ok: meStatus < 400,
        status: meStatus,
        text: async () =>
          JSON.stringify(meStatus < 400 ? { user: USER } : { error: "nope" }),
      };
    }
    throw new Error(`Unexpected fetch URL: ${href}`);
  });
  return calls;
}

async function accessToken(authServerUrl, overrides = {}) {
  return new SignJWT({ sub: "user-123", typ: "access", roles: ["athlete"], ...overrides })
    .setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setIssuer(authServerUrl)
    .setAudience(authServerUrl)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);
}

function options(authServerUrl, authorization) {
  return {
    authServerUrl,
    cookieSecret: COOKIE_SECRET,
    serviceAuthorization: "Bearer service-token",
    forwardedClientIp: "203.0.113.44",
    bearer: { authorization, audience: authServerUrl },
  };
}

describe("getSeamlessUser with a bearer access token", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("hydrates the user from a verified bearer token when there is no cookie", async () => {
    const server = nextServer();
    const meCalls = mockAuthServer(server);
    const token = await accessToken(server);

    const user = await getSeamlessUser({}, options(server, `Bearer ${token}`));

    expect(user).toEqual(USER);
    expect(meCalls).toHaveLength(1);
    expect(meCalls[0].headers).toMatchObject({
      Authorization: `Bearer ${token}`,
      "x-seamless-service-token": "Bearer service-token",
      "x-seamless-client-ip": "203.0.113.44",
    });
  });

  it("returns null without calling /users/me for an ephemeral token", async () => {
    const server = nextServer();
    const meCalls = mockAuthServer(server);
    const token = await accessToken(server, { typ: "ephemeral" });

    await expect(
      getSeamlessUser({}, options(server, `Bearer ${token}`)),
    ).resolves.toBeNull();
    expect(meCalls).toHaveLength(0);
  });

  it("returns null without calling /users/me for a token signed for another audience", async () => {
    const server = nextServer();
    const meCalls = mockAuthServer(server);
    const token = await accessToken(server, {});

    await expect(
      getSeamlessUser(
        {},
        {
          ...options(server, `Bearer ${token}`),
          bearer: { authorization: `Bearer ${token}`, audience: "https://other.example.com" },
        },
      ),
    ).resolves.toBeNull();
    expect(meCalls).toHaveLength(0);
  });

  it("returns null when bearer is not configured, even with a valid token", async () => {
    const server = nextServer();
    mockAuthServer(server);
    const token = await accessToken(server);

    const opts = options(server, `Bearer ${token}`);
    delete opts.bearer;

    await expect(getSeamlessUser({}, opts)).resolves.toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("returns null when the header is absent or uses another scheme", async () => {
    const server = nextServer();
    mockAuthServer(server);

    await expect(getSeamlessUser({}, options(server, undefined))).resolves.toBeNull();
    await expect(getSeamlessUser({}, options(server, "Basic abc"))).resolves.toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("returns null when the auth server rejects the token", async () => {
    const server = nextServer();
    mockAuthServer(server, { meStatus: 401 });
    const token = await accessToken(server);

    await expect(
      getSeamlessUser({}, options(server, `Bearer ${token}`)),
    ).resolves.toBeNull();
  });
});
