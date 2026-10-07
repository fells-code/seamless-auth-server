import { generateKeyPairSync } from "node:crypto";
import { jest } from "@jest/globals";
import cookieParser from "cookie-parser";
import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";

const ensureCookiesMock = jest.fn();

const { createEnsureCookiesMiddleware } = await import("../dist/index.js");

describe("createEnsureCookiesMiddleware (smoke)", () => {
  beforeEach(() => {
    ensureCookiesMock.mockReset();
  });

  it("calls next() when ensureCookies returns ok", async () => {
    ensureCookiesMock.mockResolvedValue({ type: "ok" });

    const app = express();
    app.use(
      createEnsureCookiesMiddleware({
        authServerUrl: "https://auth.example.com",
        cookieDomain: "example.com",
        accessCookieName: "access",
        registrationCookieName: "registration",
        refreshCookieName: "refresh",
        preAuthCookieName: "preauth",
        cookieSecret: "cookie-secret-cookie-secret-cookie-secret",
        serviceSecret: "service-secret-service-secret-service-secret",
        issuer: "https://frontend.example.com",
        audience: "https://auth.example.com",
        keyId: "dev-main",
      }),
    );

    app.get("/health", (req, res) => res.status(200).send("ok"));

    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.text).toBe("ok");
  });
});

describe("createEnsureCookiesMiddleware silent refresh", () => {
  const AUTH = "https://silent-refresh.example.com";
  const COOKIE_SECRET = "cookie-secret-cookie-secret-cookie-secret";
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const jwk = { ...publicKey.export({ format: "jwk" }), alg: "RS256", kid: "k1", use: "sig" };
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  function app(options) {
    const server = express();
    server.use(cookieParser());
    server.use(
      createEnsureCookiesMiddleware({
        authServerUrl: AUTH,
        accessCookieName: "access",
        registrationCookieName: "registration",
        refreshCookieName: "refresh",
        preAuthCookieName: "preauth",
        cookieSecret: COOKIE_SECRET,
        serviceSecret: "service-secret-service-secret-service-secret",
        issuer: "seamless-portal-api",
        audience: "seamless-auth",
        keyId: "dev-main",
        ...options,
      }),
    );
    server.get("/users/me", (req, res) => res.status(200).json(req.cookiePayload));
    return server;
  }

  async function refreshWithTokenFor(audience, options, refreshToken, issuer = AUTH) {
    const token = jwt.sign({ sub: "user-123", typ: "access", sid: "s-1" }, privateKey, {
      algorithm: "RS256",
      keyid: "k1",
      issuer,
      audience,
      expiresIn: "5m",
    });
    global.fetch = jest.fn(async (url) =>
      String(url).endsWith("/.well-known/jwks.json")
        ? { ok: true, status: 200, json: async () => ({ keys: [jwk] }) }
        : {
            ok: true,
            status: 200,
            json: async () => ({
              sub: "user-123",
              token,
              refreshToken: "rotated",
              roles: ["admin"],
              ttl: 300,
              refreshTtl: 3600,
            }),
          },
    );
    const refreshCookie = jwt.sign({ sub: "user-123", refreshToken }, COOKIE_SECRET, {
      algorithm: "HS256",
      expiresIn: "1h",
    });

    return request(app(options))
      .get("/users/me")
      .set("Cookie", `refresh=${refreshCookie}`);
  }

  it("verifies the refreshed token against accessTokenAudience", async () => {
    const res = await refreshWithTokenFor(
      "https://app.example.com",
      { accessTokenAudience: "https://app.example.com" },
      "opaque-1",
    );

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ sub: "user-123", sessionId: "s-1" });
  });

  it("refuses a refreshed token issued for another audience", async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    const res = await refreshWithTokenFor("https://app.example.com", {}, "opaque-2");
    spy.mockRestore();

    expect(res.status).toBe(401);
    expect(res.headers["set-cookie"].join(";")).not.toMatch(/access=ey/);
  });

  // On the local Docker stack the auth server signs as http://auth:5312 while
  // the app reaches it at authServerUrl (fells-code/seamless-cli#224).
  it("verifies the refreshed token against authServerIssuer", async () => {
    const res = await refreshWithTokenFor(
      "http://auth:5312",
      { accessTokenAudience: "http://auth:5312", authServerIssuer: "http://auth:5312" },
      "opaque-3",
      "http://auth:5312",
    );

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ sub: "user-123", sessionId: "s-1" });
  });

  it("refuses a refreshed token from an issuer other than the expected one", async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    const res = await refreshWithTokenFor(
      "http://auth:5312",
      { accessTokenAudience: "http://auth:5312" },
      "opaque-4",
      "http://auth:5312",
    );
    spy.mockRestore();

    expect(res.status).toBe(401);
    expect(res.headers["set-cookie"].join(";")).not.toMatch(/access=ey/);
  });
});
