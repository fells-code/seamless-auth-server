import { jest } from "@jest/globals";
import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";

const { default: createSeamlessAuthServer } = await import("../dist/index.js");

const SERVICE_SECRET = "service-secret-service-secret-service-secret";
const COOKIE_SECRET = "cookie-secret-cookie-secret-cookie-secret";
const USER_ACCESS_TOKEN = "user-access-token";

function createJsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function createAccessCookie() {
  const token = jwt.sign(
    {
      sub: "admin-123",
      roles: ["admin"],
      sessionId: "session-123",
      token: USER_ACCESS_TOKEN,
    },
    COOKIE_SECRET,
    { algorithm: "HS256", expiresIn: "300s" },
  );

  return `seamless-access=${token}`;
}

function createApp(configure) {
  const app = express();

  if (configure) {
    configure(app);
  }

  app.use(
    "/auth",
    createSeamlessAuthServer({
      authServerUrl: "https://auth.example.com",
      cookieSecret: COOKIE_SECRET,
      serviceSecret: SERVICE_SECRET,
      issuer: "https://api.example.com",
      audience: "https://auth.example.com",
      jwksKid: "test-main",
    }),
  );

  return app;
}

function lastHeaders() {
  const [, init] = global.fetch.mock.calls[0];
  return init.headers;
}

async function callAdminRoute(app) {
  const res = await request(app)
    .delete("/auth/admin/users")
    .set("Cookie", createAccessCookie())
    .send({ userId: "user-1" });

  expect(res.status).toBe(200);
}

describe("proxied service token", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(createJsonResponse(200, { message: "Success" }));
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("sends an HS256 M2M token the auth API will accept", async () => {
    await callAdminRoute(createApp());

    const header = lastHeaders()["x-seamless-service-token"];
    expect(header).toMatch(/^Bearer /);

    const raw = header.slice("Bearer ".length);
    expect(jwt.decode(raw, { complete: true }).header.alg).toBe("HS256");

    // Mirrors validateInternalServiceToken plus the iss/aud/sub checks in the API's
    // trustedClientIp middleware.
    const decoded = jwt.verify(raw, SERVICE_SECRET, { algorithms: ["HS256"] });
    expect(decoded.iss).toBe("seamless-portal-api");
    expect(decoded.aud).toBe("seamless-auth");
    expect(decoded.sub).toBeTruthy();
  });

  it("keeps the user access token in Authorization only", async () => {
    await callAdminRoute(createApp());

    const headers = lastHeaders();
    expect(headers.Authorization).toBe(`Bearer ${USER_ACCESS_TOKEN}`);
    expect(headers["x-seamless-service-token"]).not.toContain(
      USER_ACCESS_TOKEN,
    );
  });

  it("does not put anything user derived in the service token subject", async () => {
    await callAdminRoute(createApp());

    const raw = lastHeaders()["x-seamless-service-token"].slice(
      "Bearer ".length,
    );
    const decoded = jwt.verify(raw, SERVICE_SECRET, { algorithms: ["HS256"] });

    expect(decoded.sub).toBe("seamless-auth-express-adapter");
    expect(decoded.sub).not.toContain("admin-123");
  });

  it("forwards the client IP from a trusted hop", async () => {
    const app = createApp((a) => a.set("trust proxy", 1));

    await request(app)
      .delete("/auth/admin/users")
      .set("Cookie", createAccessCookie())
      .set("X-Forwarded-For", "203.0.113.44")
      .send({ userId: "user-1" });

    expect(lastHeaders()["x-seamless-client-ip"]).toBe("203.0.113.44");
  });

  it("drops the client IP when trust proxy is blanket true", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const app = createApp((a) => a.set("trust proxy", true));

    await request(app)
      .delete("/auth/admin/users")
      .set("Cookie", createAccessCookie())
      .set("X-Forwarded-For", "1.2.3.4")
      .send({ userId: "user-1" });

    expect(lastHeaders()).not.toHaveProperty("x-seamless-client-ip");
    warn.mockRestore();
  });

  it("uses a caller supplied resolver when one is configured", async () => {
    const app = express();
    app.use(
      "/auth",
      createSeamlessAuthServer({
        authServerUrl: "https://auth.example.com",
        cookieSecret: COOKIE_SECRET,
        serviceSecret: SERVICE_SECRET,
        issuer: "https://api.example.com",
        audience: "https://auth.example.com",
        jwksKid: "test-main",
        resolveClientIp: () => "198.51.100.7",
      }),
    );

    await callAdminRoute(app);

    expect(lastHeaders()["x-seamless-client-ip"]).toBe("198.51.100.7");
  });
});
