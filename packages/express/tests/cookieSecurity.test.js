import { jest } from "@jest/globals";
import cookieParser from "cookie-parser";
import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";

const { default: createSeamlessAuthServer, createEnsureCookiesMiddleware } =
  await import("../dist/index.js");

function createJsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function createRefreshCookie(subject = "user-123") {
  const token = jwt.sign(
    { sub: subject, refreshToken: "opaque-refresh-token" },
    "cookie-secret-cookie-secret-cookie-secret",
    { algorithm: "HS256", expiresIn: "3600s" },
  );

  return `seamless-refresh=${token}`;
}

function createApp(overrides = {}) {
  const app = express();

  app.use(
    "/auth",
    createSeamlessAuthServer({
      authServerUrl: "https://auth.example.com",
      cookieSecret: "cookie-secret-cookie-secret-cookie-secret",
      serviceSecret: "service-secret-service-secret-service-secret",
      issuer: "https://api.example.com",
      audience: "https://auth.example.com",
      jwksKid: "test-main",
      ...overrides,
    }),
  );

  return app;
}

async function setCookieHeaders(app, path = "/auth/users/me") {
  const res = await request(app)
    .get(path)
    .set("Cookie", createRefreshCookie());

  const header = res.headers["set-cookie"] ?? [];
  return header.filter((c) => c.startsWith("seamless-access="));
}

describe("cookie security policy (#64)", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith("/refresh")) {
        return createJsonResponse(200, {
          sub: "user-123",
          token: "new-access",
          refreshToken: "new-refresh",
          roles: ["user"],
          email: "user@example.com",
          phone: null,
          ttl: 300,
          refreshTtl: 3600,
        });
      }

      return createJsonResponse(200, {});
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.NODE_ENV;
  });

  it("defaults to Secure and SameSite=None", async () => {
    const cookies = await setCookieHeaders(createApp());

    expect(cookies).toHaveLength(1);
    expect(cookies[0]).toMatch(/; Secure/);
    expect(cookies[0]).toMatch(/; SameSite=None/);
  });

  it("stays secure when NODE_ENV is unset", async () => {
    delete process.env.NODE_ENV;

    const cookies = await setCookieHeaders(createApp());

    expect(cookies[0]).toMatch(/; Secure/);
    expect(cookies[0]).toMatch(/; SameSite=None/);
  });

  it("stays secure when NODE_ENV says development", async () => {
    process.env.NODE_ENV = "development";

    const cookies = await setCookieHeaders(createApp());

    expect(cookies[0]).toMatch(/; Secure/);
    expect(cookies[0]).toMatch(/; SameSite=None/);
  });

  it("drops Secure and falls back to SameSite=Lax when cookieSecure is false", async () => {
    const cookies = await setCookieHeaders(createApp({ cookieSecure: false }));

    expect(cookies[0]).not.toMatch(/; Secure/);
    expect(cookies[0]).toMatch(/; SameSite=Lax/);
  });

  it("honors an explicit cookieSameSite override", async () => {
    const cookies = await setCookieHeaders(
      createApp({ cookieSameSite: "strict" }),
    );

    expect(cookies[0]).toMatch(/; Secure/);
    expect(cookies[0]).toMatch(/; SameSite=Strict/);
  });

  it("defaults to Secure in the standalone middleware", async () => {
    process.env.NODE_ENV = "development";

    const app = express();
    app.use(cookieParser());
    app.use(
      createEnsureCookiesMiddleware({
        authServerUrl: "https://auth.example.com",
        accessCookieName: "seamless-access",
        registrationCookieName: "seamless-ephemeral",
        refreshCookieName: "seamless-refresh",
        preAuthCookieName: "seamless-ephemeral",
        cookieSecret: "cookie-secret-cookie-secret-cookie-secret",
        serviceSecret: "service-secret-service-secret-service-secret",
        issuer: "seamless-portal-api",
        audience: "seamless-auth",
        keyId: "dev-main",
      }),
    );
    app.get("/users/me", (req, res) => res.status(200).json({}));

    const cookies = await setCookieHeaders(app, "/users/me");

    expect(cookies[0]).toMatch(/; Secure/);
    expect(cookies[0]).toMatch(/; SameSite=None/);
  });
});
