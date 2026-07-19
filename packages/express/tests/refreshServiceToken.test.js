import { jest } from "@jest/globals";
import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";

const { default: createSeamlessAuthServer } = await import("../dist/index.js");

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
    "cookie-secret",
    { algorithm: "HS256", expiresIn: "3600s" },
  );

  return `seamless-refresh=${token}`;
}

function createApp() {
  const app = express();

  app.use(
    "/auth",
    createSeamlessAuthServer({
      authServerUrl: "https://auth.example.com",
      cookieSecret: "cookie-secret",
      serviceSecret: "service-secret",
      issuer: "https://api.example.com",
      audience: "https://auth.example.com",
      jwksKid: "dev-main",
    }),
  );

  return app;
}

function findRefreshServiceToken() {
  const call = global.fetch.mock.calls.find(([url]) =>
    String(url).endsWith("/refresh"),
  );

  if (!call) {
    return null;
  }

  const header = call[1]?.headers?.["x-seamless-service-token"];
  return typeof header === "string" ? header.replace(/^Bearer /, "") : null;
}

describe("silent-refresh service token (#59)", () => {
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
  });

  it("mints a refresh service token whose aud matches the M2M contract, not the configured audience", async () => {
    await request(createApp())
      .get("/auth/users/me")
      .set("Cookie", createRefreshCookie());

    const serviceToken = findRefreshServiceToken();
    expect(serviceToken).toBeTruthy();

    const decoded = jwt.decode(serviceToken);
    expect(decoded.aud).toBe("seamless-auth");
    expect(decoded.aud).not.toBe("https://auth.example.com");
    expect(decoded.iss).toBe("seamless-portal-api");
  });
});
