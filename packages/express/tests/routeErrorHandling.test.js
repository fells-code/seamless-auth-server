import { jest } from "@jest/globals";
import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";

const { default: createSeamlessAuthServer } = await import("../dist/index.js");

function createPreAuthCookie(subject = "user-123") {
  const token = jwt.sign(
    { sub: subject, token: "ephemeral-token" },
    "cookie-secret-cookie-secret-cookie-secret",
    {
      algorithm: "HS256",
      expiresIn: "300s",
    },
  );

  return `seamless-ephemeral=${token}`;
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
      preAuthCookieName: "seamless-ephemeral",
    }),
  );

  return app;
}

describe("route error handling", () => {
  const originalFetch = global.fetch;
  let errorSpy;

  beforeEach(() => {
    global.fetch = jest.fn();
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    global.fetch = originalFetch;
    errorSpy.mockRestore();
  });

  it("answers 500 instead of hanging when an upstream request rejects", async () => {
    global.fetch.mockRejectedValue(new Error("network down"));

    const res = await request(createApp())
      .get("/auth/magic-link/check")
      .set("Cookie", createPreAuthCookie())
      .timeout({ response: 5000 });

    expect(res.status).toBe(500);
  });

  it("returns a JSON error body without leaking internals", async () => {
    global.fetch.mockRejectedValue(new Error("SECRET_INTERNAL_DETAIL"));

    const res = await request(createApp())
      .get("/auth/magic-link/check")
      .set("Cookie", createPreAuthCookie());

    expect(res.status).toBe(500);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.body).toEqual({ error: "internal_error" });
    expect(res.text).not.toContain("SECRET_INTERNAL_DETAIL");
    expect(res.text).not.toContain("createServer");
  });

  it("logs the underlying error server side", async () => {
    const cause = new Error("network down");
    global.fetch.mockRejectedValue(cause);

    await request(createApp())
      .get("/auth/magic-link/check")
      .set("Cookie", createPreAuthCookie());

    expect(errorSpy).toHaveBeenCalledWith(
      "[SEAMLESS-AUTH-EXPRESS] - Unhandled route error.",
      cause,
    );
  });
});
