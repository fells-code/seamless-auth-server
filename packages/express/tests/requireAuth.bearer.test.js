import { jest } from "@jest/globals";
import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import jwt from "jsonwebtoken";
import { exportJWK, generateKeyPair, SignJWT } from "jose";

const { requireAuth, getSeamlessUser } = await import("../dist/index.js");

const COOKIE_SECRET = "cookie-secret-cookie-secret-cookie-secret";
const SERVICE_SECRET = "service-secret-service-secret-service-secret";

const { privateKey, publicKey } = await generateKeyPair("RS256");
const jwk = { ...(await exportJWK(publicKey)), alg: "RS256", kid: "k1", use: "sig" };

let serverCount = 0;
function nextServer() {
  serverCount += 1;
  return `https://express-${serverCount}.example.com`;
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

async function accessToken(authServerUrl, overrides = {}) {
  return new SignJWT({ sub: "user-123", typ: "access", roles: ["athlete"], ...overrides })
    .setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setIssuer(authServerUrl)
    .setAudience(authServerUrl)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);
}

function buildApp(guardOptions) {
  const app = express();
  app.use(cookieParser());
  app.use(requireAuth(guardOptions));
  app.get("/protected", (req, res) => {
    res.json({ user: req.user });
  });
  return app;
}

describe("requireAuth with bearer tokens (express)", () => {
  const originalFetch = global.fetch;
  let warn;

  beforeEach(() => {
    warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
    global.fetch = originalFetch;
  });

  it("accepts the auth API's access token when authServerUrl and audience are configured", async () => {
    const server = nextServer();
    mockAuthServer(server);
    const token = await accessToken(server);

    const res = await request(
      buildApp({ cookieSecret: COOKIE_SECRET, authServerUrl: server, audience: server }),
    )
      .get("/protected")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      id: "user-123",
      roles: ["athlete"],
      token,
    });
  });

  it("keeps rejecting bearer tokens when the option pair is not configured", async () => {
    const server = nextServer();
    mockAuthServer(server);
    const token = await accessToken(server);

    const res = await request(buildApp({ cookieSecret: COOKIE_SECRET }))
      .get("/protected")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Failed to find authentication token required" });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("rejects an ephemeral token", async () => {
    const server = nextServer();
    mockAuthServer(server);
    const token = await accessToken(server, { typ: "ephemeral" });

    const res = await request(
      buildApp({ cookieSecret: COOKIE_SECRET, authServerUrl: server, audience: server }),
    )
      .get("/protected")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Invalid or expired session" });
  });

  it("still honours the cookie, and prefers it over a bearer header", async () => {
    const server = nextServer();
    mockAuthServer(server);
    const cookie = jwt.sign({ sub: "cookie-user", token: "inner" }, COOKIE_SECRET, {
      expiresIn: "1h",
    });

    const res = await request(
      buildApp({ cookieSecret: COOKIE_SECRET, authServerUrl: server, audience: server }),
    )
      .get("/protected")
      .set("Cookie", [`seamless-access=${cookie}`])
      .set("Authorization", `Bearer ${await accessToken(server)}`);

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe("cookie-user");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("mentions both credentials in the warning when neither is sent", async () => {
    const server = nextServer();

    const res = await request(
      buildApp({ cookieSecret: COOKIE_SECRET, authServerUrl: server, audience: server }),
    ).get("/protected");

    expect(res.status).toBe(401);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/Authorization: Bearer/));
  });

  it("refuses a half-configured option pair at setup", () => {
    expect(() =>
      requireAuth({ cookieSecret: COOKIE_SECRET, authServerUrl: "https://a.example.com" }),
    ).toThrow(/authServerUrl and audience/);
    expect(() =>
      requireAuth({ cookieSecret: COOKIE_SECRET, audience: "https://a.example.com" }),
    ).toThrow(/authServerUrl and audience/);
  });
});

describe("getSeamlessUser with bearer tokens (express)", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("hydrates the user for a request that carries only a bearer token", async () => {
    const server = nextServer();
    const meCalls = mockAuthServer(server);
    const token = await accessToken(server);

    const user = await getSeamlessUser(
      {
        cookies: {},
        headers: { authorization: `Bearer ${token}` },
        ip: "203.0.113.44",
        app: { get: () => 1 },
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
    expect(meCalls[0].headers.Authorization).toBe(`Bearer ${token}`);
    expect(meCalls[0].headers["x-seamless-service-token"]).toMatch(/^Bearer /);
    expect(meCalls[0].headers["x-seamless-client-ip"]).toBe("203.0.113.44");
  });

  it("returns null for a bearer token signed for a different audience", async () => {
    const server = nextServer();
    const meCalls = mockAuthServer(server);
    const token = await accessToken(server);

    const user = await getSeamlessUser(
      { cookies: {}, headers: { authorization: `Bearer ${token}` }, app: { get: () => 1 } },
      {
        authServerUrl: server,
        cookieSecret: COOKIE_SECRET,
        serviceSecret: SERVICE_SECRET,
        audience: "https://other.example.com",
      },
    );

    expect(user).toBeNull();
    expect(meCalls).toHaveLength(0);
  });
});
