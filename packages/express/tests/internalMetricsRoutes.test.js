import { jest } from "@jest/globals";
import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";

const { default: createSeamlessAuthServer } = await import("../dist/index.js");

// Unsigned: the adapter only reads the inner token's type, the auth API verifies it.
const ACCESS_TOKEN = `e30.${Buffer.from(JSON.stringify({ typ: "access" })).toString("base64url")}.sig`;

function createJsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function createAccessCookie(subject = "admin-123") {
  const token = jwt.sign(
    {
      sub: subject,
      roles: ["admin"],
      sessionId: "session-123",
      token: ACCESS_TOKEN,
    },
    "cookie-secret-cookie-secret-cookie-secret",
    {
      algorithm: "HS256",
      expiresIn: "300s",
    },
  );

  return `seamless-access=${token}`;
}

function createApp() {
  const app = express();

  app.use(
    "/auth",
    createSeamlessAuthServer({
      fetchManifest: false,
      authServerUrl: "https://auth.example.com",
      cookieSecret: "cookie-secret-cookie-secret-cookie-secret",
      serviceSecret: "service-secret-service-secret-service-secret",
      audience: "https://auth.example.com",
      jwksKid: "test-main",
    }),
  );

  return app;
}

describe("internal metrics routes", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("forwards auth event summary requests with access identity", async () => {
    global.fetch.mockResolvedValue(
      createJsonResponse(200, {
        summary: [{ type: "login_success", count: 5 }],
      }),
    );

    const res = await request(createApp())
      .get("/auth/internal/auth-events/summary")
      .set("Cookie", createAccessCookie());

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      summary: [{ type: "login_success", count: 5 }],
    });
    expect(global.fetch).toHaveBeenCalledWith(
      "https://auth.example.com/internal/auth-events/summary",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          "x-seamless-service-token": expect.not.stringContaining(ACCESS_TOKEN),
        }),
      }),
    );
  });
});
