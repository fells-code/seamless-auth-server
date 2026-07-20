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

function createAccessCookie(subject = "user-123") {
  const token = jwt.sign(
    { sub: subject, roles: ["user"], token: "access-token" },
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
      audience: "https://auth.example.com",
      jwksKid: "test-main",
    }),
  );

  return app;
}

describe("TOTP proxy routes", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("proxies TOTP status with access identity", async () => {
    global.fetch.mockResolvedValue(
      createJsonResponse(200, {
        enabled: true,
        verifiedAt: "2026-05-15T12:00:00.000Z",
        lastUsedAt: null,
      }),
    );

    const res = await request(createApp())
      .get("/auth/totp/status")
      .set("Cookie", createAccessCookie());

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      enabled: true,
      verifiedAt: "2026-05-15T12:00:00.000Z",
      lastUsedAt: null,
    });

    expect(global.fetch).toHaveBeenCalledWith(
      "https://auth.example.com/totp/status",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer access-token",
        }),
      }),
    );
  });

  it("proxies TOTP enrollment start", async () => {
    global.fetch.mockResolvedValue(
      createJsonResponse(200, {
        message: "Success",
        secret: "BASE32SECRET",
        otpauthUrl: "otpauth://totp/Seamless:user@example.com?secret=BASE32SECRET",
      }),
    );

    const res = await request(createApp())
      .post("/auth/totp/enroll/start")
      .set("Cookie", createAccessCookie());

    expect(res.status).toBe(200);
    expect(res.body.secret).toBe("BASE32SECRET");
    expect(global.fetch).toHaveBeenCalledWith(
      "https://auth.example.com/totp/enroll/start",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("proxies TOTP enrollment verify with the code body", async () => {
    global.fetch.mockResolvedValue(
      createJsonResponse(200, { message: "Success" }),
    );

    const body = { code: "123456" };

    const res = await request(createApp())
      .post("/auth/totp/enroll/verify")
      .set("Cookie", createAccessCookie())
      .send(body);

    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledWith(
      "https://auth.example.com/totp/enroll/verify",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(body),
      }),
    );
  });

  it("proxies TOTP disable with the code body", async () => {
    global.fetch.mockResolvedValue(
      createJsonResponse(200, { message: "Success" }),
    );

    const body = { code: "123456" };

    const res = await request(createApp())
      .post("/auth/totp/disable")
      .set("Cookie", createAccessCookie())
      .send(body);

    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledWith(
      "https://auth.example.com/totp/disable",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(body),
      }),
    );
  });

  it("proxies TOTP step-up verification with the code body", async () => {
    global.fetch.mockResolvedValue(
      createJsonResponse(200, {
        message: "Success",
        method: "totp",
        fresh: true,
        verifiedAt: "2026-05-15T12:00:00.000Z",
        expiresAt: "2026-05-15T12:05:00.000Z",
        maxAgeSeconds: 300,
      }),
    );

    const body = { code: "123456" };

    const res = await request(createApp())
      .post("/auth/totp/verify-mfa")
      .set("Cookie", createAccessCookie())
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body.method).toBe("totp");
    expect(global.fetch).toHaveBeenCalledWith(
      "https://auth.example.com/totp/verify-mfa",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(body),
      }),
    );
  });

  it("rejects TOTP routes without an access session", async () => {
    const res = await request(createApp()).get("/auth/totp/status");

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
