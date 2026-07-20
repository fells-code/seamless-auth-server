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
    }),
  );

  return app;
}

describe("login OTP routes", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("proxies login email OTP requests with pre-auth identity", async () => {
    global.fetch.mockResolvedValue(
      createJsonResponse(200, {
        message: "If an account exists, a code has been sent.",
      }),
    );

    const res = await request(createApp())
      .post("/auth/otp/generate-login-email-otp")
      .set("Cookie", createPreAuthCookie());

    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledWith(
      "https://auth.example.com/otp/generate-login-email-otp",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer ephemeral-token",
          "x-seamless-service-token": expect.not.stringContaining("ephemeral-token"),
        }),
      }),
    );
  });

  it("proxies registration phone OTP verification with the stored ephemeral token", async () => {
    global.fetch.mockResolvedValue(
      createJsonResponse(200, {
        message: "Phone verified successfully.",
      }),
    );

    const body = { verificationToken: "123456" };

    const res = await request(createApp())
      .post("/auth/otp/verify-phone-otp")
      .set("Cookie", createPreAuthCookie())
      .send(body);

    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledWith(
      "https://auth.example.com/otp/verify-phone-otp",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(body),
        headers: expect.objectContaining({
          Authorization: "Bearer ephemeral-token",
          "x-seamless-service-token": expect.not.stringContaining("ephemeral-token"),
        }),
      }),
    );
  });
  // The generate routes are state changing (they send an SMS or email). Serving
  // them over GET made them reachable as a simple cross-site request, so an
  // <img> tag could trigger unbounded sends to a signed-in user. They are now
  // POST only. Carries the pre-auth cookie so the cookie middleware does not
  // answer 400 before routing, which would pass whether or not the route exists.
  it("no longer exposes the generate routes over GET", async () => {
    for (const path of [
      "/auth/otp/generate-phone-otp",
      "/auth/otp/generate-email-otp",
      "/auth/otp/generate-login-phone-otp",
      "/auth/otp/generate-login-email-otp",
    ]) {
      const res = await request(createApp())
        .get(path)
        .set("Cookie", createPreAuthCookie());

      expect([404, 405]).toContain(res.status);
    }

    expect(global.fetch).not.toHaveBeenCalled();
  });
});
