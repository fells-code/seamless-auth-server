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

describe("OAuth routes", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("proxies provider listing", async () => {
    global.fetch.mockResolvedValue(
      createJsonResponse(200, {
        providers: [{ id: "google", name: "Google", scopes: ["openid"] }],
      }),
    );

    const res = await request(createApp()).get("/auth/oauth/providers");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      providers: [{ id: "google", name: "Google", scopes: ["openid"] }],
    });
    expect(global.fetch).toHaveBeenCalledWith(
      "https://auth.example.com/oauth/providers",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("proxies OAuth start requests", async () => {
    global.fetch.mockResolvedValue(
      createJsonResponse(200, {
        authorizationUrl: "https://provider.example.com/auth",
        state: "state",
      }),
    );

    const body = { redirectUri: "https://app.example.com/oauth/callback" };

    const res = await request(createApp())
      .post("/auth/oauth/google/start")
      .send(body);

    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledWith(
      "https://auth.example.com/oauth/google/start",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(body),
      }),
    );
  });
});
