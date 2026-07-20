import { jest } from "@jest/globals";
import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";

const { default: createSeamlessAuthServer, getSeamlessUser } = await import(
  "../dist/index.js"
);
const { pollMagicLinkConfirmationHandler } = await import(
  "@seamless-auth/core/handlers/pollMagicLinkConfirmationHandler"
);

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

describe("minor correctness fixes", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  // Asserted on the core result rather than the HTTP response: Express strips
  // the body on a 204 either way, so only the handler result shows the fix.
  it("carries no body on the unverified 204 result", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 204,
      json: async () => undefined,
    });

    const result = await pollMagicLinkConfirmationHandler(
      {},
      {
        authServerUrl: "https://auth.example.com",
        audience: "https://auth.example.com",
        accessCookieName: "seamless-access",
        refreshCookieName: "seamless-refresh",
      },
    );

    expect(result.status).toBe(204);
    expect(result.body).toBeUndefined();
  });

  it("returns 204 on the magic link check route while unverified", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 204,
      json: async () => undefined,
    });

    const res = await request(createApp())
      .get("/auth/magic-link/check")
      .set("Cookie", createPreAuthCookie());

    expect(res.status).toBe(204);
    expect(res.text).toBe("");
  });

  it("resolves to null when /users/me returns an empty body", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => undefined,
    });

    const req = {
      cookies: { "seamless-access": createAccessCookie().split("=")[1] },
      headers: {},
    };

    await expect(
      getSeamlessUser(req, {
        authServerUrl: "https://auth.example.com",
        cookieSecret: "cookie-secret-cookie-secret-cookie-secret",
      }),
    ).resolves.toBeNull();
  });

  it("forwards query params on the grouped auth event route", async () => {
    global.fetch.mockResolvedValue(createJsonResponse(200, { groups: [] }));

    const res = await request(createApp())
      .get("/auth/internal/auth-events/grouped")
      .query({ groupBy: "type", from: "2026-01-01" })
      .set("Cookie", createAccessCookie());

    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledWith(
      "https://auth.example.com/internal/auth-events/grouped?groupBy=type&from=2026-01-01",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("surfaces a string-shaped upstream error from the bootstrap invite", async () => {
    global.fetch.mockResolvedValue(
      createJsonResponse(409, { error: "admin_already_exists" }),
    );

    const res = await request(createApp())
      .post("/auth/internal/bootstrap/admin-invite")
      .send({ email: "admin@example.com" });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "admin_already_exists" });
  });

  it("does not throw on a bootstrap invite with no body", async () => {
    global.fetch.mockResolvedValue(
      createJsonResponse(400, { error: "email_required" }),
    );

    const res = await request(createApp()).post(
      "/auth/internal/bootstrap/admin-invite",
    );

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "email_required" });
  });
});
