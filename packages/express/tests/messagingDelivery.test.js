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

function createApp(emailTransport) {
  const app = express();

  app.use(
    "/auth",
    createSeamlessAuthServer({
      authServerUrl: "https://auth.example.com",
      cookieSecret: "cookie-secret-cookie-secret-cookie-secret",
      serviceSecret: "service-secret-service-secret-service-secret",
      audience: "https://auth.example.com",
      jwksKid: "test-main",
      messaging: {
        email: emailTransport,
        defaults: {
          appName: "Seamless Review",
          emailFrom: "auth@example.com",
        },
      },
    }),
  );

  return app;
}

describe("messaging delivery routes", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("delivers magic links through the configured email transport for pre-authenticated requests", async () => {
    const emailTransport = {
      name: "test-email",
      send: jest.fn().mockResolvedValue({
        accepted: true,
        provider: "test-email",
        channel: "email",
      }),
    };

    global.fetch.mockResolvedValue(
      createJsonResponse(200, {
        message: "If an account exists, a login link has been sent.",
        delivery: {
          kind: "magic_link_email",
          to: "user@example.com",
          token: "magic-token",
          magicLinkUrl: "https://app.example.com/verify-magiclink?token=magic-token",
        },
      }),
    );

    const res = await request(createApp(emailTransport))
      .get("/auth/magic-link")
      .set("Cookie", createPreAuthCookie());

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      message: "If an account exists, a login link has been sent.",
    });

    expect(global.fetch).toHaveBeenCalledWith(
      "https://auth.example.com/magic-link",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "x-seamless-auth-delivery-mode": "external",
          Authorization: "Bearer ephemeral-token",
          "x-seamless-service-token": expect.stringMatching(/^Bearer /),
          "x-seamless-client-ip": expect.any(String),
        }),
      }),
    );

    expect(emailTransport.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "user@example.com",
        from: "auth@example.com",
        subject: "Seamless Review - Your sign-in link",
        text: expect.stringContaining("https://app.example.com/verify-magiclink?token=magic-token"),
        html: expect.stringContaining("https://app.example.com/verify-magiclink?token=magic-token"),
      }),
    );
  });

  it("polls magic-link confirmation with the trusted client IP service token", async () => {
    const emailTransport = {
      name: "test-email",
      send: jest.fn(),
    };

    global.fetch.mockResolvedValue(
      createJsonResponse(204, {
        message: "Success",
      }),
    );

    const res = await request(createApp(emailTransport))
      .get("/auth/magic-link/check")
      .set("Cookie", createPreAuthCookie());

    expect(res.status).toBe(204);

    expect(global.fetch).toHaveBeenCalledWith(
      "https://auth.example.com/magic-link/check",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          Authorization: "Bearer ephemeral-token",
          "x-seamless-service-token": expect.stringMatching(/^Bearer /),
          "x-seamless-client-ip": expect.any(String),
        }),
      }),
    );

    expect(global.fetch.mock.calls[0][1].headers["x-seamless-service-token"]).not.toBe(
      "Bearer ephemeral-token",
    );
  });

  it("delivers bootstrap invites through the configured email transport and strips delivery details", async () => {
    const emailTransport = {
      name: "test-email",
      send: jest.fn().mockResolvedValue({
        accepted: true,
        provider: "test-email",
        channel: "email",
      }),
    };

    global.fetch.mockResolvedValue(
      createJsonResponse(201, {
        success: true,
        data: {
          expiresAt: "2026-04-21T20:00:00.000Z",
          delivery: {
            kind: "bootstrap_invite_email",
            to: "admin@example.com",
            inviteUrl: "https://app.example.com/login?bootstrapToken=bootstrap-token",
            token: "bootstrap-token",
          },
        },
      }),
    );

    const res = await request(createApp(emailTransport))
      .post("/auth/internal/bootstrap/admin-invite")
      .set("Authorization", "Bearer bootstrap-secret")
      .send({ email: "admin@example.com" });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      expiresAt: "2026-04-21T20:00:00.000Z",
    });

    expect(global.fetch).toHaveBeenCalledWith(
      "https://auth.example.com/internal/bootstrap/admin-invite",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          Authorization: "Bearer bootstrap-secret",
          "x-seamless-service-token": expect.stringMatching(/^Bearer /),
          "x-seamless-client-ip": expect.any(String),
          "x-seamless-auth-delivery-mode": "external",
        }),
      }),
    );

    expect(emailTransport.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "admin@example.com",
        from: "auth@example.com",
        subject: "Seamless Review - Bootstrap invite",
        text: expect.stringContaining("https://app.example.com/login?bootstrapToken=bootstrap-token"),
        html: expect.stringContaining("https://app.example.com/login?bootstrapToken=bootstrap-token"),
      }),
    );
  });
  it("warns and sends nothing when the auth API returns no delivery payload", async () => {
    const emailTransport = {
      name: "test-email",
      send: jest.fn(),
    };

    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});

    global.fetch.mockResolvedValue(
      createJsonResponse(200, {
        message: "If an account exists, a login link has been sent.",
      }),
    );

    const res = await request(createApp(emailTransport))
      .get("/auth/magic-link")
      .set("Cookie", createPreAuthCookie());

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      message: "If an account exists, a login link has been sent.",
    });

    expect(emailTransport.send).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("returned no delivery payload"),
    );

    warn.mockRestore();
  });

  it("does not warn about a missing delivery payload when messaging is not configured", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});

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

    global.fetch.mockResolvedValue(
      createJsonResponse(200, {
        message: "If an account exists, a login link has been sent.",
      }),
    );

    const res = await request(app)
      .get("/auth/magic-link")
      .set("Cookie", createPreAuthCookie());

    expect(res.status).toBe(200);
    expect(warn).not.toHaveBeenCalledWith(
      expect.stringContaining("returned no delivery payload"),
    );

    warn.mockRestore();
  });
});
