// POST /refresh in cookie transport. Bearer transport is covered end to end in
// the fastify package's bearerTransport.parity test, which runs both adapters.
import { jest } from "@jest/globals";
import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import { exportJWK, generateKeyPair, SignJWT } from "jose";

const { default: createSeamlessAuthServer } = await import("../dist/index.js");

const AUTH = "https://refresh-route.example.com";
const COOKIE_SECRET = "cookie-secret-cookie-secret-cookie-secret";
const SERVICE_SECRET = "service-secret-service-secret-service-secret";

const { privateKey, publicKey } = await generateKeyPair("RS256");
const jwk = { ...(await exportJWK(publicKey)), alg: "RS256", kid: "k1", use: "sig" };

const ACCESS = await new SignJWT({ sub: "user-123", typ: "access", sid: "s-2" })
  .setProtectedHeader({ alg: "RS256", kid: "k1" })
  .setIssuer(AUTH)
  .setAudience(AUTH)
  .setIssuedAt()
  .setExpirationTime("5m")
  .sign(privateKey);

const ROTATED = {
  sub: "user-123",
  token: ACCESS,
  refreshToken: "refresh-2",
  roles: ["athlete"],
  email: "user@example.com",
  phone: null,
  ttl: 1800,
  refreshTtl: 2592000,
};

function mockUpstream({ refreshStatus = 200 } = {}) {
  const calls = [];
  global.fetch = jest.fn(async (url, init = {}) => {
    const path = url.toString().slice(AUTH.length);
    calls.push({ path, init });
    if (path === "/.well-known/jwks.json") {
      return new Response(JSON.stringify({ keys: [jwk] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (path === "/refresh") {
      return {
        ok: refreshStatus < 400,
        status: refreshStatus,
        text: async () =>
          JSON.stringify(refreshStatus < 400 ? ROTATED : { error: "invalid_refresh_token" }),
      };
    }
    throw new Error(`Unexpected upstream call: ${path}`);
  });
  return calls;
}

function app() {
  const a = express();
  a.use(
    "/auth",
    createSeamlessAuthServer({
      authServerUrl: AUTH,
      cookieSecret: COOKIE_SECRET,
      serviceSecret: SERVICE_SECRET,
      audience: AUTH,
      jwksKid: "test-main",
    }),
  );
  return a;
}

function refreshCookie(refreshToken) {
  return jwt.sign({ sub: "user-123", refreshToken }, COOKIE_SECRET, {
    algorithm: "HS256",
    expiresIn: "1h",
  });
}

describe("POST /refresh in cookie transport", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("rotates the session into fresh cookies and keeps the tokens out of the body", async () => {
    const calls = mockUpstream();

    const res = await request(app())
      .post("/auth/refresh")
      .set("Cookie", [`seamless-refresh=${refreshCookie("cookie-refresh-a")}`]);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      sub: "user-123",
      roles: ["athlete"],
      email: "user@example.com",
      phone: null,
      ttl: 1800,
      refreshTtl: 2592000,
    });

    const names = res.headers["set-cookie"].map((c) => c.split("=")[0]);
    expect(names).toEqual(["seamless-access", "seamless-refresh"]);

    const upstream = calls.find((c) => c.path === "/refresh");
    expect(upstream.init.headers.Authorization).toBe("Bearer cookie-refresh-a");
  });

  it("answers 401 without asking upstream when the refresh cookie is missing", async () => {
    const calls = mockUpstream();

    const res = await request(app()).post("/auth/refresh");

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "refresh token required" });
    expect(calls.filter((c) => c.path === "/refresh")).toHaveLength(0);
  });

  it("answers 401 and clears the session cookies when the auth API refuses the rotation", async () => {
    mockUpstream({ refreshStatus: 401 });

    const res = await request(app())
      .post("/auth/refresh")
      .set("Cookie", [`seamless-refresh=${refreshCookie("cookie-refresh-b")}`]);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "invalid_refresh_token" });

    const cleared = res.headers["set-cookie"].map((c) => c.split(";")[0]);
    expect(cleared).toEqual(["seamless-access=", "seamless-refresh="]);
  });
});
