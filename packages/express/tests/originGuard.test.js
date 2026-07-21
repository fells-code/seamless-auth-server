import { jest } from "@jest/globals";
import express from "express";
import request from "supertest";

const { default: createSeamlessAuthServer } = await import("../dist/index.js");

const BLOCKED = { error: "cross_site_request_blocked" };

function createJsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function createApp(overrides = {}) {
  const app = express();

  app.use(
    "/auth",
    createSeamlessAuthServer({
      authServerUrl: "https://auth.example.com",
      cookieSecret: "cookie-secret-cookie-secret-cookie-secret",
      serviceSecret: "service-secret-service-secret-service-secret",
      audience: "https://auth.example.com",
      jwksKid: "test-main",
      ...overrides,
    }),
  );

  return app;
}

describe("origin guard (#104)", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn(async () => createJsonResponse(200, {}));
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("rejects a cross-site state-changing request", async () => {
    const res = await request(createApp())
      .post("/auth/magic-link")
      .set("Sec-Fetch-Site", "cross-site");

    expect(res.status).toBe(403);
    expect(res.body).toEqual(BLOCKED);
  });

  it("accepts a same-origin request", async () => {
    const res = await request(createApp())
      .post("/auth/magic-link")
      .set("Sec-Fetch-Site", "same-origin");

    expect(res.status).not.toBe(403);
    expect(res.body).not.toEqual(BLOCKED);
  });

  it("accepts a same-site request", async () => {
    const res = await request(createApp())
      .post("/auth/magic-link")
      .set("Sec-Fetch-Site", "same-site");

    expect(res.status).not.toBe(403);
    expect(res.body).not.toEqual(BLOCKED);
  });

  it("accepts a server-to-server request with no Origin or Sec-Fetch-Site", async () => {
    const res = await request(createApp()).post("/auth/magic-link");

    expect(res.status).not.toBe(403);
    expect(res.body).not.toEqual(BLOCKED);
  });

  it("rejects a literal null Origin", async () => {
    const res = await request(createApp())
      .post("/auth/magic-link")
      .set("Origin", "null");

    expect(res.status).toBe(403);
    expect(res.body).toEqual(BLOCKED);
  });

  it("does not gate GET requests even cross-site", async () => {
    const res = await request(createApp())
      .get("/auth/oauth/providers")
      .set("Sec-Fetch-Site", "cross-site");

    expect(res.status).not.toBe(403);
    expect(res.body).not.toEqual(BLOCKED);
  });

  it("does not gate GET /magic-link/verify/:token", async () => {
    const res = await request(createApp())
      .get("/auth/magic-link/verify/some-token")
      .set("Sec-Fetch-Site", "cross-site");

    expect(res.status).not.toBe(403);
    expect(res.body).not.toEqual(BLOCKED);
  });

  it("lets a CORS preflight through", async () => {
    const res = await request(createApp())
      .options("/auth/magic-link")
      .set("Sec-Fetch-Site", "cross-site");

    expect(res.status).not.toBe(403);
    expect(res.body).not.toEqual(BLOCKED);
  });

  it("does nothing when cookieSameSite is lax, even cross-site", async () => {
    const res = await request(createApp({ cookieSameSite: "lax" }))
      .post("/auth/magic-link")
      .set("Sec-Fetch-Site", "cross-site");

    expect(res.status).not.toBe(403);
    expect(res.body).not.toEqual(BLOCKED);
  });

  describe("Sec-Fetch-Site absent fallback", () => {
    it("accepts an allowlisted Origin when allowedOrigins is set", async () => {
      const res = await request(
        createApp({ allowedOrigins: ["https://app.example.com"] }),
      )
        .post("/auth/magic-link")
        .set("Origin", "https://app.example.com");

      expect(res.status).not.toBe(403);
      expect(res.body).not.toEqual(BLOCKED);
    });

    it("rejects a non-allowlisted Origin when allowedOrigins is set", async () => {
      const res = await request(
        createApp({ allowedOrigins: ["https://app.example.com"] }),
      )
        .post("/auth/magic-link")
        .set("Origin", "https://evil.example.com");

      expect(res.status).toBe(403);
      expect(res.body).toEqual(BLOCKED);
    });

    it("accepts any Origin when allowedOrigins is unset", async () => {
      const res = await request(createApp())
        .post("/auth/magic-link")
        .set("Origin", "https://evil.example.com");

      expect(res.status).not.toBe(403);
      expect(res.body).not.toEqual(BLOCKED);
    });
  });
});
