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

function createAccessCookie(subject = "admin-123") {
  const token = jwt.sign(
    { sub: subject, roles: ["admin"], token: "access-token" },
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

describe("oauth provider admin proxy routes", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("proxies the provider list with access identity", async () => {
    global.fetch.mockResolvedValue(
      createJsonResponse(200, { providers: [{ id: "google" }] }),
    );

    const res = await request(createApp())
      .get("/auth/system-config/oauth-providers")
      .set("Cookie", createAccessCookie());

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ providers: [{ id: "google" }] });

    expect(global.fetch).toHaveBeenCalledWith(
      "https://auth.example.com/system-config/oauth-providers",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer access-token",
        }),
      }),
    );
  });

  it("proxies provider creation with the request body", async () => {
    global.fetch.mockResolvedValue(
      createJsonResponse(201, { provider: { id: "github" } }),
    );

    const body = {
      id: "github",
      name: "GitHub",
      clientId: "gh-client",
      clientSecretEnv: "GITHUB_CLIENT_SECRET",
      authorizationUrl: "https://github.com/login/oauth/authorize",
      tokenUrl: "https://github.com/login/oauth/access_token",
      userInfoUrl: "https://api.github.com/user",
    };

    const res = await request(createApp())
      .post("/auth/system-config/oauth-providers")
      .set("Cookie", createAccessCookie())
      .send(body);

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ provider: { id: "github" } });

    expect(global.fetch).toHaveBeenCalledWith(
      "https://auth.example.com/system-config/oauth-providers",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(body),
      }),
    );
  });

  it("proxies a provider update to the id-scoped upstream path", async () => {
    global.fetch.mockResolvedValue(
      createJsonResponse(200, { provider: { id: "google", enabled: false } }),
    );

    const res = await request(createApp())
      .patch("/auth/system-config/oauth-providers/google")
      .set("Cookie", createAccessCookie())
      .send({ enabled: false });

    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledWith(
      "https://auth.example.com/system-config/oauth-providers/google",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ enabled: false }),
      }),
    );
  });

  it("proxies a provider deletion to the id-scoped upstream path", async () => {
    global.fetch.mockResolvedValue(
      createJsonResponse(200, { success: true, id: "google" }),
    );

    const res = await request(createApp())
      .delete("/auth/system-config/oauth-providers/google")
      .set("Cookie", createAccessCookie());

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, id: "google" });
    expect(global.fetch).toHaveBeenCalledWith(
      "https://auth.example.com/system-config/oauth-providers/google",
      expect.objectContaining({
        method: "DELETE",
      }),
    );
  });

  it("does not proxy an unauthenticated provider list request", async () => {
    const res = await request(createApp()).get(
      "/auth/system-config/oauth-providers",
    );

    // ensureCookies gates access-required routes before the handler: with no
    // access or refresh cookie present it returns a 400 "missing cookie" rather
    // than forwarding upstream.
    expect(res.status).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
