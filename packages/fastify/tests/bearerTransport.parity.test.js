// Drives a whole bearer-transport sign-in through both adapters against the
// same mocked auth API: start a login, verify an OTP, read the profile, rotate
// the session, sign out. Each step is asserted by value and the two adapters
// are held to the same answer, with no Set-Cookie anywhere.
import { jest } from "@jest/globals";
import express from "express";
import Fastify from "fastify";
import jwt from "jsonwebtoken";
import request from "supertest";
import { exportJWK, generateKeyPair, SignJWT } from "jose";

const { default: seamlessAuth } = await import("../dist/index.js");
const { default: createSeamlessAuthServer } = await import(
  "../../express/dist/index.js"
);

const AUTH = "https://bearer-parity.example.com";
const COOKIE_SECRET = "cookie-secret-cookie-secret-cookie-secret";
const SERVICE_SECRET = "service-secret-service-secret-service-secret";
const BEARER = { "x-seamless-auth-transport": "bearer" };

const OPTIONS = {
  authServerUrl: AUTH,
  cookieSecret: COOKIE_SECRET,
  serviceSecret: SERVICE_SECRET,
  audience: AUTH,
  jwksKid: "test-main",
};

const { privateKey, publicKey } = await generateKeyPair("RS256");
const jwk = { ...(await exportJWK(publicKey)), alg: "RS256", kid: "k1", use: "sig" };

async function signed(claims) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setIssuer(AUTH)
    .setAudience(AUTH)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);
}

const EPHEMERAL = await signed({ sub: "user-123", typ: "ephemeral" });
const ACCESS = await signed({ sub: "user-123", typ: "access", sid: "s-1", roles: ["athlete"] });
const ACCESS_2 = await signed({ sub: "user-123", typ: "access", sid: "s-2", roles: ["athlete"] });

const LOGIN_BODY = {
  message: "Login continued",
  token: EPHEMERAL,
  sub: "user-123",
  ttl: 300,
  identifierType: "email",
  loginMethods: ["email_otp"],
};
const SESSION_BODY = {
  message: "Success",
  sub: "user-123",
  token: ACCESS,
  refreshToken: "refresh-1",
  roles: ["athlete"],
  email: "user@example.com",
  phone: null,
  ttl: 1800,
  refreshTtl: 2592000,
};
const ROTATED_BODY = { ...SESSION_BODY, token: ACCESS_2, refreshToken: "refresh-2" };
const ME_BODY = {
  user: { id: "user-123", email: "user@example.com", phone: null, roles: ["athlete"] },
  credentials: [],
};

// The mocked auth API. Records every call so a test can assert what the
// adapter forwarded.
function mockUpstream() {
  const calls = [];
  global.fetch = jest.fn(async (url, init = {}) => {
    const href = url.toString();
    const path = href.slice(AUTH.length).split("?")[0];
    calls.push({ path, init });

    const json = (status, body) => ({
      ok: status < 400,
      status,
      text: async () => JSON.stringify(body),
    });

    if (path === "/.well-known/jwks.json") {
      return new Response(JSON.stringify({ keys: [jwk] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (path === "/login") return json(200, LOGIN_BODY);
    if (path === "/otp/generate-login-email-otp") return json(200, { message: "sent" });
    if (path === "/otp/verify-login-email-otp") {
      return init.headers?.Authorization === `Bearer ${EPHEMERAL}`
        ? json(200, SESSION_BODY)
        : json(401, { error: "Unauthorized" });
    }
    if (path === "/users/me") {
      return init.headers?.Authorization === `Bearer ${ACCESS}` ||
        init.headers?.Authorization === `Bearer ${ACCESS_2}`
        ? json(200, ME_BODY)
        : json(401, { error: "Unauthorized" });
    }
    if (path === "/refresh") {
      if (init.headers?.Authorization?.startsWith("Bearer refresh-1")) return json(200, ROTATED_BODY);
      return json(401, { error: "refresh_token_reused" });
    }
    if (path === "/logout") return json(200, { message: "Success" });
    if (path === "/organizations") return json(200, { organizations: [] });
    throw new Error(`Unexpected upstream call: ${path}`);
  });
  return calls;
}

async function viaFastify({ method, path, headers, payload }) {
  const app = Fastify();
  await app.register(seamlessAuth, { prefix: "/auth", ...OPTIONS });
  await app.ready();
  try {
    const res = await app.inject({
      method: method.toUpperCase(),
      url: `/auth${path}`,
      headers: { ...BEARER, ...(headers ?? {}) },
      ...(payload === undefined ? {} : { payload }),
    });
    return {
      status: res.statusCode,
      body: res.body ? JSON.parse(res.body) : null,
      setCookie: res.headers["set-cookie"],
    };
  } finally {
    await app.close();
  }
}

async function viaExpress({ method, path, headers, payload }) {
  const app = express();
  app.use("/auth", createSeamlessAuthServer(OPTIONS));
  let req = request(app)[method](`/auth${path}`).set({ ...BEARER, ...(headers ?? {}) });
  if (payload !== undefined) req = req.send(payload);
  const res = await req;
  return {
    status: res.status,
    body: res.text ? JSON.parse(res.text) : null,
    setCookie: res.headers["set-cookie"],
  };
}

const ADAPTERS = [
  ["fastify", viaFastify],
  ["express", viaExpress],
];

describe("bearer transport through the auth proxy", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe.each(ADAPTERS)("%s", (name, run) => {
    it("returns the ephemeral token from /login and sets no cookie", async () => {
      mockUpstream();

      const res = await run({ method: "post", path: "/login", payload: { identifier: "a@b.c" } });

      expect(res.status).toBe(200);
      expect(res.body).toEqual(LOGIN_BODY);
      expect(res.setCookie).toBeUndefined();
    });

    it("forwards the ephemeral token on a pre-auth route and returns the session whole", async () => {
      const calls = mockUpstream();

      const sent = await run({
        method: "post",
        path: "/otp/generate-login-email-otp",
        headers: { authorization: `Bearer ${EPHEMERAL}` },
        payload: {},
      });
      expect(sent.status).toBe(200);
      expect(calls.find((c) => c.path === "/otp/generate-login-email-otp").init.headers.Authorization)
        .toBe(`Bearer ${EPHEMERAL}`);

      const verified = await run({
        method: "post",
        path: "/otp/verify-login-email-otp",
        headers: { authorization: `Bearer ${EPHEMERAL}` },
        payload: { token: "ABCDEF" },
      });

      expect(verified.status).toBe(200);
      expect(verified.body).toEqual(SESSION_BODY);
      expect(verified.setCookie).toBeUndefined();
    });

    it("reads the profile with the access token", async () => {
      const calls = mockUpstream();

      const res = await run({
        method: "get",
        path: "/users/me",
        headers: { authorization: `Bearer ${ACCESS}` },
      });

      expect(res.status).toBe(200);
      expect(res.body).toEqual(ME_BODY);
      expect(res.setCookie).toBeUndefined();

      const me = calls.find((c) => c.path === "/users/me");
      expect(me.init.headers.Authorization).toBe(`Bearer ${ACCESS}`);
      expect(me.init.headers["x-seamless-service-token"]).toMatch(/^Bearer /);
    });

    it("rotates the session through POST /refresh", async () => {
      const calls = mockUpstream();
      // Distinct per adapter: core collapses rotations of the same token
      // process-wide, so a shared value would be served from the first run.
      const refreshToken = `refresh-1-${name}`;

      const res = await run({
        method: "post",
        path: "/refresh",
        headers: { authorization: `Bearer ${refreshToken}` },
      });

      expect(res.status).toBe(200);
      expect(res.body).toEqual(ROTATED_BODY);
      expect(res.setCookie).toBeUndefined();

      const refresh = calls.find((c) => c.path === "/refresh");
      expect(refresh.init.headers.Authorization).toBe(`Bearer ${refreshToken}`);
      expect(refresh.init.headers["x-seamless-service-token"]).toMatch(/^Bearer /);
    });

    it("passes a reuse detection failure through from /refresh", async () => {
      mockUpstream();

      const res = await run({
        method: "post",
        path: "/refresh",
        headers: { authorization: "Bearer refresh-spent" },
      });

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: "refresh_token_reused" });
    });

    it("answers 401 on /refresh with no bearer token, asking upstream nothing", async () => {
      const calls = mockUpstream();

      const res = await run({ method: "post", path: "/refresh" });

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: "refresh token required" });
      expect(calls.filter((c) => c.path === "/refresh")).toHaveLength(0);
    });

    it("signs out without clearing cookies it never set", async () => {
      const calls = mockUpstream();

      const res = await run({
        method: "delete",
        path: "/logout",
        headers: { authorization: `Bearer ${ACCESS}` },
      });

      expect(res.status).toBe(204);
      expect(res.setCookie).toBeUndefined();
      expect(calls.find((c) => c.path === "/logout").init.headers.Authorization)
        .toBe(`Bearer ${ACCESS}`);
    });

    it("proxies an access route with the bearer token and refuses one without", async () => {
      const calls = mockUpstream();

      const ok = await run({
        method: "get",
        path: "/organizations",
        headers: { authorization: `Bearer ${ACCESS}` },
      });
      expect(ok.status).toBe(200);
      expect(ok.body).toEqual({ organizations: [] });
      expect(calls.find((c) => c.path === "/organizations").init.headers.Authorization)
        .toBe(`Bearer ${ACCESS}`);

      const before = calls.length;
      const refused = await run({ method: "get", path: "/organizations" });
      expect(refused.status).toBe(401);
      expect(refused.body).toEqual({ error: "access session required" });
      expect(calls.length).toBe(before);
    });

    it("never touches the cookie jar, even when a refresh cookie is present", async () => {
      const calls = mockUpstream();
      const refreshCookie = jwt.sign(
        { sub: "user-123", refreshToken: "cookie-refresh" },
        COOKIE_SECRET,
        { algorithm: "HS256", expiresIn: "1h" },
      );

      const res = await run({
        method: "get",
        path: "/users/me",
        headers: {
          authorization: `Bearer ${ACCESS}`,
          cookie: `seamless-refresh=${refreshCookie}`,
        },
      });

      expect(res.status).toBe(200);
      expect(res.setCookie).toBeUndefined();
      expect(calls.filter((c) => c.path === "/refresh")).toHaveLength(0);
    });
  });

  it("both adapters give the same answer at every step", async () => {
    const steps = [
      { method: "post", path: "/login", payload: { identifier: "a@b.c" } },
      {
        method: "post",
        path: "/otp/verify-login-email-otp",
        headers: { authorization: `Bearer ${EPHEMERAL}` },
        payload: { token: "ABCDEF" },
      },
      { method: "get", path: "/users/me", headers: { authorization: `Bearer ${ACCESS}` } },
      { method: "post", path: "/refresh", headers: { authorization: "Bearer refresh-1" } },
      { method: "post", path: "/refresh", headers: { authorization: "Bearer refresh-spent" } },
      { method: "delete", path: "/logout", headers: { authorization: `Bearer ${ACCESS}` } },
      { method: "get", path: "/organizations" },
    ];

    for (const step of steps) {
      mockUpstream();
      const f = await viaFastify(step);
      mockUpstream();
      const e = await viaExpress(step);

      expect({ step: step.path, ...f }).toEqual({ step: step.path, ...e });
      expect(f.setCookie).toBeUndefined();
    }
  });
});
