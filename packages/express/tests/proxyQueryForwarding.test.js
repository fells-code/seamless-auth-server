// Locks how query parameters reach the auth API. The admin routes hand
// `req.query` straight through, so a repeated parameter has to stay repeated:
// the API's AuthEventQuerySchema accepts `type` as an array, and joining the
// values into `type=login,logout` matches no event type upstream.
import { jest } from "@jest/globals";
import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";

const { default: createSeamlessAuthServer } = await import("../dist/index.js");

const COOKIE_SECRET = "cookie-secret-cookie-secret-cookie-secret";

function createJsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function createAccessCookie() {
  const token = jwt.sign(
    {
      sub: "admin-123",
      roles: ["admin"],
      sessionId: "session-123",
      token: "access-token",
    },
    COOKIE_SECRET,
    { algorithm: "HS256", expiresIn: "300s" },
  );

  return `seamless-access=${token}`;
}

function createApp() {
  const app = express();

  app.use(
    "/auth",
    createSeamlessAuthServer({
      authServerUrl: "https://auth.example.com",
      cookieSecret: COOKIE_SECRET,
      serviceSecret: "service-secret-service-secret-service-secret",
      audience: "https://auth.example.com",
      jwksKid: "test-main",
    }),
  );

  return app;
}

describe("proxy query forwarding", () => {
  const originalFetch = global.fetch;
  let requestedUrl;

  beforeEach(() => {
    requestedUrl = undefined;
    global.fetch = jest.fn(async (url) => {
      requestedUrl = String(url);
      return createJsonResponse(200, { ok: true });
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  async function get(path) {
    await request(createApp()).get(path).set("Cookie", createAccessCookie());
    return requestedUrl;
  }

  it("repeats an array parameter on an admin route", async () => {
    const url = await get(
      "/auth/admin/auth-events?type=login&type=logout&limit=5",
    );

    expect(url).toBe(
      "https://auth.example.com/admin/auth-events?type=login&type=logout&limit=5",
    );
    expect(url).not.toContain("login%2Clogout");
  });

  it("repeats an array parameter on a passthrough route", async () => {
    const url = await get("/auth/organizations?type=a&type=b");

    expect(url).toBe("https://auth.example.com/organizations?type=a&type=b");
  });

  it("forwards a scalar parameter unchanged", async () => {
    expect(await get("/auth/admin/sessions?limit=5")).toBe(
      "https://auth.example.com/admin/sessions?limit=5",
    );
  });

  it("sends no query separator when there is no query", async () => {
    expect(await get("/auth/totp/status")).toBe(
      "https://auth.example.com/totp/status",
    );
  });
});
