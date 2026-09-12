import { jest } from "@jest/globals";
import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";

const { default: createSeamlessAuthServer } = await import("../dist/index.js");

const COOKIE_SECRET = "cookie-secret-cookie-secret-cookie-secret";

function accessCookie() {
  const token = jwt.sign(
    { sub: "user-123", roles: ["admin"], sessionId: "s-1", token: "access-token" },
    COOKIE_SECRET,
    { algorithm: "HS256", expiresIn: "300s" },
  );

  return `seamless-access=${token}`;
}

function createApp() {
  const app = express();

  app.use(
    "/auth",
    createSeamlessAuthServer({
      authServerUrl: "https://auth.example.com",
      cookieSecret: COOKIE_SECRET,
      serviceSecret: "service-secret-service-secret-service-secret",
      audience: "https://auth.example.com",
      jwksKid: "test-main",
    }),
  );

  return app;
}

/**
 * Every auth API route that reads query parameters and is reachable through this
 * adapter, with a parameter each one actually consumes.
 *
 * Kept as one table rather than a test per route because the failure this guards
 * against is silent: a handler built without a query is indistinguishable from one
 * whose caller sent none, so the endpoint answers 200 with the wrong page and
 * nothing reports an error. `/admin/users` and the login statistics both shipped
 * that way. A route added to the adapter without forwarding its query fails here.
 */
const QUERY_ROUTES = [
  ["/admin/users", "search=ada&limit=10&offset=20"],
  ["/admin/sessions", "limit=10&offset=20"],
  ["/admin/auth-events", "type=login_success&limit=10"],
  ["/admin/organizations", "search=acme&limit=10&offset=20"],
  ["/internal/auth-events/summary", "from=2026-01-01&interval=day"],
  ["/internal/auth-events/timeseries", "from=2026-01-01&interval=day"],
  ["/internal/auth-events/grouped", "from=2026-01-01&interval=day"],
  ["/internal/auth-events/login-stats", "from=2026-01-01&to=2026-02-01"],
  ["/internal/metrics/funnel", "from=2026-01-01&to=2026-02-01"],
  ["/internal/metrics/sign-ins", "from=2026-01-01&to=2026-02-01"],
];

describe("query forwarding", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it.each(QUERY_ROUTES)(
    "forwards the query string on GET %s",
    async (path, query) => {
      await request(createApp())
        .get(`/auth${path}?${query}`)
        .set("Cookie", accessCookie());

      const [url] = global.fetch.mock.calls[0];
      const forwarded = new URL(url).searchParams;

      for (const [name, value] of new URLSearchParams(query)) {
        expect(forwarded.get(name)).toBe(value);
      }
    },
  );
});
