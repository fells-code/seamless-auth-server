import { jest } from "@jest/globals";
import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";

const { default: createSeamlessAuthServer } = await import("../dist/index.js");

function createResponse(status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
  };
}

function createAccessCookie(subject = "user-123") {
  const token = jwt.sign(
    {
      sub: subject,
      roles: ["user"],
      sessionId: "session-123",
      token: "access-token",
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
      authServerUrl: "https://auth.example.com",
      cookieSecret: "cookie-secret-cookie-secret-cookie-secret",
      serviceSecret: "service-secret-service-secret-service-secret",
      issuer: "https://api.example.com",
      audience: "https://auth.example.com",
      jwksKid: "test-main",
    }),
  );

  return app;
}

describe("logout routes", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue(createResponse());
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("logs out the current session with DELETE /logout", async () => {
    const res = await request(createApp())
      .delete("/auth/logout")
      .set("Cookie", createAccessCookie());

    expect(res.status).toBe(204);
    expect(global.fetch).toHaveBeenCalledWith(
      "https://auth.example.com/logout",
      expect.objectContaining({
        method: "DELETE",
        headers: expect.objectContaining({
          Authorization: "Bearer access-token",
          "x-seamless-service-token": "Bearer access-token",
        }),
      }),
    );
  });

  it("keeps GET /logout as an all-session compatibility route", async () => {
    const res = await request(createApp())
      .get("/auth/logout")
      .set("Cookie", createAccessCookie());

    expect(res.status).toBe(204);
    expect(global.fetch).toHaveBeenCalledWith(
      "https://auth.example.com/logout/all",
      expect.objectContaining({
        method: "DELETE",
      }),
    );
  });

  it("logs out all sessions with DELETE /logout/all", async () => {
    const res = await request(createApp())
      .delete("/auth/logout/all")
      .set("Cookie", createAccessCookie());

    expect(res.status).toBe(204);
    expect(global.fetch).toHaveBeenCalledWith(
      "https://auth.example.com/logout/all",
      expect.objectContaining({
        method: "DELETE",
      }),
    );
  });
});
