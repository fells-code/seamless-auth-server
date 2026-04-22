import { jest } from "@jest/globals";
import express from "express";
import request from "supertest";

const { default: createSeamlessAuthServer } = await import("../dist/index.js");

function createJsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function createApp(emailTransport) {
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

  it("delivers magic links through the configured email transport for public requests", async () => {
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

    const res = await request(createApp(emailTransport)).get("/auth/magic-link");

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
        }),
      }),
    );
    expect(global.fetch.mock.calls[0][1].headers.Authorization).toBeUndefined();

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
          url: "https://app.example.com/login?bootstrapToken=bootstrap-token",
          expiresAt: "2026-04-21T20:00:00.000Z",
          token: "bootstrap-token",
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
      url: "https://app.example.com/login?bootstrapToken=bootstrap-token",
      expiresAt: "2026-04-21T20:00:00.000Z",
      token: "bootstrap-token",
    });

    expect(global.fetch).toHaveBeenCalledWith(
      "https://auth.example.com/internal/bootstrap/admin-invite",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          authorization: "Bearer bootstrap-secret",
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
});
