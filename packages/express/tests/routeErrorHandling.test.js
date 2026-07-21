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

  it("answers 400 for a malformed JSON body", async () => {
    const res = await request(createApp())
      .post("/auth/users/update")
      .set("Content-Type", "application/json")
      .send("{bad json");

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "bad_request" });
  });

  it("answers 413 for a body over the parser limit", async () => {
    const res = await request(createApp())
      .post("/auth/users/update")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ name: "a".repeat(200 * 1024) }));

    expect(res.status).toBe(413);
    expect(res.body).toEqual({ error: "payload_too_large" });
  });

  it("does not echo the rejected payload back to the client", async () => {
    const res = await request(createApp())
      .post("/auth/users/update")
      .set("Content-Type", "application/json")
      .send('{"secret":"SECRET_INTERNAL_DETAIL"');

    expect(res.status).toBe(400);
    expect(res.text).not.toContain("SECRET_INTERNAL_DETAIL");
  });

  it("does not log client errors at error level", async () => {
    await request(createApp())
      .post("/auth/users/update")
      .set("Content-Type", "application/json")
      .send("{bad json");

    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("logs the underlying error server side", async () => {
    global.fetch.mockRejectedValue(new Error("network down"));

    await request(createApp())
      .get("/auth/magic-link/check")
      .set("Cookie", createPreAuthCookie());

    expect(errorSpy).toHaveBeenCalledWith(
      "[SEAMLESS-AUTH-EXPRESS] - Unhandled route error.",
      expect.stringContaining("network down"),
    );
  });

  it("redacts sensitive values in the logged error", async () => {
    global.fetch.mockRejectedValue(
      new Error("upstream rejected Bearer sk-secret-token-value"),
    );

    await request(createApp())
      .get("/auth/magic-link/check")
      .set("Cookie", createPreAuthCookie());

    const [, logged] = errorSpy.mock.calls[0];
    expect(logged).not.toContain("sk-secret-token-value");
    expect(logged).toContain("[REDACTED]");
  });
});
