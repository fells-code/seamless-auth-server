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
  const token = jwt.sign({ sub: subject, roles: ["user"] }, "cookie-secret", {
    algorithm: "HS256",
    expiresIn: "300s",
  });

  return `seamless-access=${token}`;
}

function createRegistrationCookie(subject = "user-123") {
  const token = jwt.sign({ sub: subject, roles: ["user"] }, "cookie-secret", {
    algorithm: "HS256",
    expiresIn: "300s",
  });

  return `seamless-ephemeral=${token}`;
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

describe("step-up proxy routes", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("proxies step-up status with access identity", async () => {
    global.fetch.mockResolvedValue(
      createJsonResponse(200, {
        fresh: false,
        method: null,
        verifiedAt: null,
        expiresAt: null,
        maxAgeSeconds: 300,
      }),
    );

    const res = await request(createApp())
      .get("/auth/step-up/status")
      .set("Cookie", createAccessCookie());

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      fresh: false,
      method: null,
      verifiedAt: null,
      expiresAt: null,
      maxAgeSeconds: 300,
    });

    expect(global.fetch).toHaveBeenCalledWith(
      "https://auth.example.com/step-up/status",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: expect.stringMatching(/^Bearer /),
          "x-seamless-service-token": expect.stringMatching(/^Bearer /),
        }),
      }),
    );
  });

  it("proxies step-up finish with the WebAuthn assertion body", async () => {
    global.fetch.mockResolvedValue(
      createJsonResponse(200, {
        message: "Success",
        fresh: true,
        method: "webauthn",
        verifiedAt: "2026-05-15T12:00:00.000Z",
        expiresAt: "2026-05-15T12:05:00.000Z",
        maxAgeSeconds: 300,
      }),
    );

    const body = { assertionResponse: { id: "credential-id" } };

    const res = await request(createApp())
      .post("/auth/step-up/webauthn/finish")
      .set("Cookie", createAccessCookie())
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      message: "Success",
      fresh: true,
      method: "webauthn",
      verifiedAt: "2026-05-15T12:00:00.000Z",
      expiresAt: "2026-05-15T12:05:00.000Z",
      maxAgeSeconds: 300,
    });

    expect(global.fetch).toHaveBeenCalledWith(
      "https://auth.example.com/step-up/webauthn/finish",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(body),
        headers: expect.objectContaining({
          Authorization: expect.stringMatching(/^Bearer /),
          "x-seamless-service-token": expect.stringMatching(/^Bearer /),
        }),
      }),
    );
  });

  it("proxies step-up start with PRF request body", async () => {
    global.fetch.mockResolvedValue(
      createJsonResponse(200, {
        challenge: "challenge",
        extensions: {
          prf: {
            eval: {
              first: "salt",
            },
          },
        },
      }),
    );

    const body = { prf: { salt: "salt" }, credentialId: "credential-id" };

    const res = await request(createApp())
      .post("/auth/step-up/webauthn/start")
      .set("Cookie", createAccessCookie())
      .send(body);

    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledWith(
      "https://auth.example.com/step-up/webauthn/start",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(body),
      }),
    );
  });

  it("proxies passkey registration start with PRF query options", async () => {
    global.fetch.mockResolvedValue(
      createJsonResponse(200, {
        challenge: "challenge",
        extensions: {
          prf: {},
        },
      }),
    );

    const res = await request(createApp())
      .get("/auth/webAuthn/register/start")
      .query({ requirePrf: "true" })
      .set("Cookie", createRegistrationCookie());

    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledWith(
      "https://auth.example.com/webAuthn/register/start?requirePrf=true",
      expect.objectContaining({
        method: "GET",
      }),
    );
  });
});
