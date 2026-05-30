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
    { sub: subject, roles: ["user"], sessionId: "session-123" },
    "cookie-secret",
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
      cookieSecret: "cookie-secret",
      serviceSecret: "service-secret",
      issuer: "https://api.example.com",
      audience: "https://auth.example.com",
      jwksKid: "dev-main",
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
          Authorization: expect.stringMatching(/^Bearer /),
          "x-seamless-service-token": expect.stringMatching(/^Bearer /),
        }),
      }),
    );

    const authorization =
      global.fetch.mock.calls[0][1].headers.Authorization.replace("Bearer ", "");
    const decoded = jwt.decode(authorization);

    expect(decoded.sid).toBe("session-123");
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
