import { jest } from "@jest/globals";
import cookie from "@fastify/cookie";
import Fastify from "fastify";
import jwt from "jsonwebtoken";
import { exportJWK, generateKeyPair, SignJWT } from "jose";

const {
  default: seamlessAuth,
  requireAuth,
  requireRole,
  getSeamlessUser,
} = await import("../dist/index.js");

const COOKIE_SECRET = "cookie-secret-cookie-secret-cookie-secret";
const SERVICE_SECRET = "service-secret-service-secret-service-secret";

const { privateKey, publicKey } = await generateKeyPair("RS256");
const jwk = { ...(await exportJWK(publicKey)), alg: "RS256", kid: "k1", use: "sig" };

let serverCount = 0;
function nextServer() {
  serverCount += 1;
  return `https://fastify-${serverCount}.example.com`;
}

const ME = { id: "user-123", email: "u@example.com", phone: null, roles: ["athlete"] };

function mockAuthServer(authServerUrl) {
  const meCalls = [];
  global.fetch = jest.fn(async (url, init) => {
    const href = url.toString();
    if (href === `${authServerUrl}/.well-known/jwks.json`) {
      return new Response(JSON.stringify({ keys: [jwk] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (href === `${authServerUrl}/users/me`) {
      meCalls.push(init);
      return { ok: true, status: 200, text: async () => JSON.stringify({ user: ME }) };
    }
    throw new Error(`Unexpected fetch URL: ${href}`);
  });
  return meCalls;
}

async function accessToken(authServerUrl, overrides = {}, issuer = authServerUrl) {
  return new SignJWT({ sub: "user-123", typ: "access", roles: ["athlete"], ...overrides })
    .setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setIssuer(issuer)
    .setAudience(issuer)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);
}

function signedCookie(payload) {
  return jwt.sign(payload, COOKIE_SECRET, { algorithm: "HS256", expiresIn: "300s" });
}

async function buildApp(guardOptions, { role } = {}) {
  const app = Fastify();
  await app.register(cookie);
  app.get(
    "/protected",
    {
      preHandler: role
        ? [requireAuth(guardOptions), requireRole(role)]
        : requireAuth(guardOptions),
    },
    async (req) => ({ user: req.user }),
  );
  await app.ready();
  return app;
}

async function get(app, headers = {}) {
  try {
    const res = await app.inject({ method: "GET", url: "/protected", headers });
    return { status: res.statusCode, body: res.json() };
  } finally {
    await app.close();
  }
}

describe("requireAuth (fastify)", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("accepts a valid access cookie and sets request.user", async () => {
    const app = await buildApp({ cookieSecret: COOKIE_SECRET });

    const res = await get(app, {
      cookie: `seamless-access=${signedCookie({ sub: "user-1", roles: ["admin"], token: "inner" })}`,
    });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: "user-1", roles: ["admin"], token: "inner" });
  });

  it("rejects a request with no credential", async () => {
    const res = await get(await buildApp({ cookieSecret: COOKIE_SECRET }));

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Failed to find authentication token required" });
  });

  it("rejects a cookie signed by another secret", async () => {
    const forged = jwt.sign({ sub: "user-1" }, "attacker-secret-attacker-secret-attacker");

    const res = await get(await buildApp({ cookieSecret: COOKIE_SECRET }), {
      cookie: `seamless-access=${forged}`,
    });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Invalid or expired session" });
  });

  it("accepts the auth API's access token when authServerUrl and audience are configured", async () => {
    const server = nextServer();
    mockAuthServer(server);
    const token = await accessToken(server);

    const res = await get(
      await buildApp({ cookieSecret: COOKIE_SECRET, authServerUrl: server, audience: server }),
      { authorization: `Bearer ${token}` },
    );

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: "user-123", roles: ["athlete"], token });
  });

  it("keeps rejecting bearer tokens when the option pair is not configured", async () => {
    const server = nextServer();
    mockAuthServer(server);

    const res = await get(await buildApp({ cookieSecret: COOKIE_SECRET }), {
      authorization: `Bearer ${await accessToken(server)}`,
    });

    expect(res.status).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("rejects an ephemeral token", async () => {
    const server = nextServer();
    mockAuthServer(server);

    const res = await get(
      await buildApp({ cookieSecret: COOKIE_SECRET, authServerUrl: server, audience: server }),
      { authorization: `Bearer ${await accessToken(server, { typ: "ephemeral" })}` },
    );

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Invalid or expired session" });
  });

  it("prefers the cookie over a bearer header", async () => {
    const server = nextServer();
    mockAuthServer(server);

    const res = await get(
      await buildApp({ cookieSecret: COOKIE_SECRET, authServerUrl: server, audience: server }),
      {
        cookie: `seamless-access=${signedCookie({ sub: "cookie-user" })}`,
        authorization: `Bearer ${await accessToken(server)}`,
      },
    );

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe("cookie-user");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("feeds requireRole from a bearer session", async () => {
    const server = nextServer();
    mockAuthServer(server);

    const allowed = await get(
      await buildApp(
        { cookieSecret: COOKIE_SECRET, authServerUrl: server, audience: server },
        { role: "athlete" },
      ),
      { authorization: `Bearer ${await accessToken(server)}` },
    );
    expect(allowed.status).toBe(200);

    const denied = await get(
      await buildApp(
        { cookieSecret: COOKIE_SECRET, authServerUrl: server, audience: server },
        { role: "organizer" },
      ),
      { authorization: `Bearer ${await accessToken(server)}` },
    );
    expect(denied.status).toBe(403);
    expect(denied.body.error).toBe("Insufficient role");
  });

  it("refuses a half-configured option pair at setup", () => {
    expect(() =>
      requireAuth({ cookieSecret: COOKIE_SECRET, authServerUrl: "https://a.example.com" }),
    ).toThrow(/authServerUrl and audience/);
  });
});

describe("getSeamlessUser (fastify)", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  const options = (server) => ({
    authServerUrl: server,
    cookieSecret: COOKIE_SECRET,
    serviceSecret: SERVICE_SECRET,
    audience: server,
    jwksKid: "test-main",
  });

  it("hydrates the user from a cookie session", async () => {
    const server = nextServer();
    const meCalls = mockAuthServer(server);

    const user = await getSeamlessUser(
      {
        cookies: { "seamless-access": signedCookie({ sub: "user-123", token: "inner" }) },
        user: { token: "inner" },
        headers: {},
        ip: "203.0.113.44",
        server: { initialConfig: {} },
      },
      options(server),
    );

    expect(user).toEqual(ME);
    expect(meCalls[0].headers.Authorization).toBe("Bearer inner");
  });

  it("hydrates the user from a bearer token when there is no cookie", async () => {
    const server = nextServer();
    const meCalls = mockAuthServer(server);
    const token = await accessToken(server);

    const user = await getSeamlessUser(
      {
        cookies: {},
        headers: { authorization: `Bearer ${token}` },
        ip: "203.0.113.44",
        server: { initialConfig: {} },
      },
      options(server),
    );

    expect(user).toEqual(ME);
    expect(meCalls[0].headers.Authorization).toBe(`Bearer ${token}`);
    expect(meCalls[0].headers["x-seamless-service-token"]).toMatch(/^Bearer /);
  });

  it("returns null when the request carries neither credential", async () => {
    const server = nextServer();
    mockAuthServer(server);

    await expect(
      getSeamlessUser(
        { cookies: {}, headers: {}, server: { initialConfig: {} } },
        options(server),
      ),
    ).resolves.toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe("authServerIssuer (fastify)", () => {
  // fells-code/seamless-cli#224: the Docker stack's auth server signs as
  // http://auth:5312 while a host-run app reaches it at a different URL. The
  // auth API sets `aud` to its ISSUER as well, so `audience` follows it.
  const ISSUER = "http://auth:5312";
  const SERVER_GUARD = (server) => ({
    cookieSecret: COOKIE_SECRET,
    authServerUrl: server,
    audience: server,
  });
  const DOCKER_GUARD = (server) => ({
    cookieSecret: COOKIE_SECRET,
    authServerUrl: server,
    authServerIssuer: ISSUER,
    audience: ISSUER,
  });
  const originalFetch = global.fetch;
  let warn;

  beforeEach(() => {
    warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
    global.fetch = originalFetch;
  });

  it("requireAuth verifies against authServerUrl by default", async () => {
    const server = nextServer();
    mockAuthServer(server);
    const token = await accessToken(server);

    const res = await get(await buildApp(SERVER_GUARD(server)), {
      authorization: `Bearer ${token}`,
    });

    expect(res.status).toBe(200);
  });

  it("requireAuth accepts a token from a configured issuer distinct from the URL", async () => {
    const server = nextServer();
    mockAuthServer(server);
    const token = await accessToken(server, {}, ISSUER);

    const res = await get(await buildApp(DOCKER_GUARD(server)), {
      authorization: `Bearer ${token}`,
    });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: "user-123", token });
  });

  it("requireAuth rejects a token whose issuer is not the expected one", async () => {
    const server = nextServer();
    mockAuthServer(server);
    const fromIssuer = await accessToken(server, {}, ISSUER);
    const fromUrl = await accessToken(server);

    const unconfigured = await get(await buildApp(SERVER_GUARD(server)), {
      authorization: `Bearer ${fromIssuer}`,
    });
    const misconfigured = await get(await buildApp(DOCKER_GUARD(server)), {
      authorization: `Bearer ${fromUrl}`,
    });

    for (const res of [unconfigured, misconfigured]) {
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: "Invalid or expired session" });
    }
  });

  it("getSeamlessUser verifies a bearer token against the configured issuer", async () => {
    const server = nextServer();
    const meCalls = mockAuthServer(server);
    const token = await accessToken(server, {}, ISSUER);
    const options = {
      authServerUrl: server,
      cookieSecret: COOKIE_SECRET,
      serviceSecret: SERVICE_SECRET,
      audience: server,
      jwksKid: "test-main",
    };

    await expect(getSeamlessUser({ cookies: {}, headers: { authorization: `Bearer ${token}` }, server: { initialConfig: {} } }, options)).resolves.toBeNull();
    expect(meCalls).toHaveLength(0);

    await expect(
      getSeamlessUser({ cookies: {}, headers: { authorization: `Bearer ${token}` }, server: { initialConfig: {} } }, {
        ...options,
        authServerIssuer: ISSUER,
        audience: ISSUER,
      }),
    ).resolves.toEqual(ME);
    expect(meCalls).toHaveLength(1);
  });
});

// The plugin registers @fastify/cookie in its own encapsulated scope, so an
// application route outside it has no request.cookies. The guard and
// getSeamlessUser are for exactly those routes (#207).
describe("routes outside the plugin, with no cookie plugin of their own", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  async function appWithPlugin() {
    const app = Fastify();
    await app.register(seamlessAuth, {
      prefix: "/auth",
      fetchManifest: false,
      authServerUrl: "https://auth.example.com",
      cookieSecret: COOKIE_SECRET,
      serviceSecret: SERVICE_SECRET,
      audience: "https://auth.example.com",
      jwksKid: "test-main",
    });
    app.get(
      "/api/me",
      { preHandler: requireAuth({ cookieSecret: COOKIE_SECRET }) },
      async (req) => ({ user: req.user }),
    );
    await app.ready();
    return app;
  }

  it("requireAuth reads the session cookie from the Cookie header", async () => {
    const app = await appWithPlugin();
    try {
      const res = await app.inject({
        method: "GET",
        url: "/api/me",
        headers: {
          cookie: `theme=dark; seamless-access=${signedCookie({ sub: "user-1", token: "inner" })}`,
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().user).toMatchObject({ id: "user-1", token: "inner" });
    } finally {
      await app.close();
    }
  });

  it("requireAuth still refuses a forged cookie there", async () => {
    const app = await appWithPlugin();
    const forged = jwt.sign({ sub: "user-1" }, "attacker-secret-attacker-secret-attacker");
    try {
      const res = await app.inject({
        method: "GET",
        url: "/api/me",
        headers: { cookie: `seamless-access=${forged}` },
      });

      expect(res.statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });

  it("requireAuth refuses a request with no Cookie header", async () => {
    const app = await appWithPlugin();
    try {
      const res = await app.inject({ method: "GET", url: "/api/me" });

      expect(res.statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });

  it("getSeamlessUser reads the session cookie from the Cookie header", async () => {
    const server = nextServer();
    const meCalls = mockAuthServer(server);

    const user = await getSeamlessUser(
      {
        headers: {
          cookie: `seamless-access=${signedCookie({ sub: "user-123", token: "inner" })}`,
        },
        ip: "203.0.113.44",
        server: { initialConfig: {} },
      },
      {
        authServerUrl: server,
        cookieSecret: COOKIE_SECRET,
        serviceSecret: SERVICE_SECRET,
        audience: server,
        jwksKid: "test-main",
      },
    );

    expect(user).toEqual(ME);
    expect(meCalls[0].headers.Authorization).toBe("Bearer inner");
  });
});
