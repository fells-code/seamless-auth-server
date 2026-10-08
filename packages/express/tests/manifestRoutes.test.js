import { jest } from "@jest/globals";
import express from "express";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import jwt from "jsonwebtoken";
import request from "supertest";

const { default: createSeamlessAuthServer } = await import("../dist/index.js");

const AUTH = "https://auth.example.com";
const COOKIE_SECRET = "cookie-secret-cookie-secret-cookie-secret";

let privateKey;
let jwk;

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey;
  jwk = { ...(await exportJWK(pair.publicKey)), alg: "RS256", kid: "k1", use: "sig" };
});

function signAccessToken(sub = "user-1") {
  return new SignJWT({ sub, sid: "session-1" })
    .setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setIssuer(AUTH)
    .setAudience(AUTH)
    .setSubject(sub)
    .setExpirationTime("5m")
    .sign(privateKey);
}

function json(status, body) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function cookie(name, payload) {
  return `${name}=${jwt.sign(payload, COOKIE_SECRET, { algorithm: "HS256", expiresIn: "300s" })}`;
}

function createApp(overrides = {}) {
  const app = express();
  app.use(
    "/auth",
    createSeamlessAuthServer({
      authServerUrl: AUTH,
      cookieSecret: COOKIE_SECRET,
      serviceSecret: "service-secret-service-secret-service-secret",
      audience: AUTH,
      jwksKid: "test-main",
      ...overrides,
    }),
  );
  return app;
}

function routeFetch(handlers) {
  global.fetch = jest.fn(async (url, init) => {
    const path = new URL(url).pathname;
    if (path === "/.well-known/jwks.json") return json(200, { keys: [jwk] });
    const handler = handlers[`${init?.method ?? "GET"} ${path}`];
    return handler ? handler(url, init) : json(404, { error: "not_found" });
  });
}

function upstreamCalls(path) {
  return global.fetch.mock.calls.filter(([url]) => new URL(url).pathname === path);
}

describe("routes proxied from the adapter manifest", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("serves TOTP sign-in, which has no handler of its own", async () => {
    const token = await signAccessToken();
    routeFetch({
      "POST /totp/verify-login": async () =>
        json(200, {
          message: "Success",
          sub: "user-1",
          token,
          refreshToken: "refresh-1",
          ttl: 300,
          refreshTtl: 3600,
        }),
    });

    const res = await request(createApp({ fetchManifest: false }))
      .post("/auth/totp/verify-login")
      .set("Cookie", cookie("seamless-ephemeral", { sub: "user-1", token: "pre-auth-token" }))
      .send({ code: "123456" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      message: "Success",
      sub: "user-1",
      ttl: 300,
      refreshTtl: 3600,
    });

    const [[, init]] = upstreamCalls("/totp/verify-login");
    expect(init.headers.Authorization).toBe("Bearer pre-auth-token");
    expect(init.body).toBe(JSON.stringify({ code: "123456" }));

    const setCookies = res.headers["set-cookie"].join(";");
    expect(setCookies).toMatch(/seamless-access=/);
    expect(setCookies).toMatch(/seamless-refresh=/);
  });

  it("refuses a manifest route without the cookie it needs", async () => {
    routeFetch({});

    const res = await request(createApp({ fetchManifest: false }))
      .post("/auth/totp/verify-login")
      .send({ code: "123456" });

    expect(res.status).toBe(401);
    expect(upstreamCalls("/totp/verify-login")).toHaveLength(0);
  });

  it("answers 404 for a path the manifest does not list", async () => {
    routeFetch({});

    const res = await request(createApp({ fetchManifest: false })).get(
      "/auth/not-a-route",
    );

    expect(res.status).toBe(404);
  });

  it("does not expose a deprecated GET the manifest leaves out", async () => {
    routeFetch({});

    const res = await request(createApp({ fetchManifest: false }))
      .get("/auth/otp/generate-login-email-otp")
      .set("Cookie", cookie("seamless-ephemeral", { sub: "user-1", token: "t" }));

    expect(res.status).toBe(404);
    expect(upstreamCalls("/otp/generate-login-email-otp")).toHaveLength(0);
  });

  it("follows a route the live manifest adds, fetching the manifest once", async () => {
    routeFetch({
      "GET /.well-known/seamless-adapter.json": async () =>
        json(200, {
          schemaVersion: 1,
          apiVersion: "9.9.9",
          session: {},
          routes: [{ method: "GET", path: "/brand-new/{id}", credential: "access" }],
        }),
      "GET /brand-new/a%20b": async () => json(200, { fresh: true }),
    });

    const app = createApp();
    const accessCookie = cookie("seamless-access", { sub: "user-1", token: "access-token" });

    for (let i = 0; i < 2; i++) {
      const res = await request(app)
        .get("/auth/brand-new/a%20b")
        .set("Cookie", accessCookie);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ fresh: true });
    }

    expect(upstreamCalls("/.well-known/seamless-adapter.json")).toHaveLength(1);
    expect(upstreamCalls("/brand-new/a%20b")[0][1].headers.Authorization).toBe(
      "Bearer access-token",
    );
  });

  it("keeps a route's own handler ahead of the manifest", async () => {
    routeFetch({
      "GET /users/me": async () =>
        json(200, { user: { id: "user-1" }, credentials: [], extra: "dropped" }),
    });

    const res = await request(createApp({ fetchManifest: false }))
      .get("/auth/users/me")
      .set("Cookie", cookie("seamless-access", { sub: "user-1", token: "access-token" }));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ user: { id: "user-1" }, credentials: [] });
  });

  it("returns the session body whole in bearer transport", async () => {
    const token = await signAccessToken();
    const session = { message: "Success", sub: "user-1", token, ttl: 300 };
    routeFetch({ "POST /totp/verify-login": async () => json(200, session) });

    const res = await request(createApp({ fetchManifest: false }))
      .post("/auth/totp/verify-login")
      .set("x-seamless-auth-transport", "bearer")
      .set("Authorization", "Bearer client-pre-auth")
      .send({ code: "123456" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(session);
    expect(res.headers["set-cookie"]).toBeUndefined();
    expect(upstreamCalls("/totp/verify-login")[0][1].headers.Authorization).toBe(
      "Bearer client-pre-auth",
    );
  });
});
