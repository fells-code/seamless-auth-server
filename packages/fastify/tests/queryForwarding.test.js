import { jest } from "@jest/globals";
import Fastify from "fastify";
import jwt from "jsonwebtoken";

const { default: seamlessAuth } = await import("../dist/index.js");

const COOKIE_SECRET = "cookie-secret-cookie-secret-cookie-secret";

function accessCookie() {
  const token = jwt.sign(
    { sub: "user-123", roles: ["admin"], sessionId: "s-1", token: "access-token" },
    COOKIE_SECRET,
    { algorithm: "HS256", expiresIn: "300s" },
  );

  return `seamless-access=${token}`;
}

async function buildApp() {
  const app = Fastify();

  await app.register(seamlessAuth, {
    prefix: "/auth",
    authServerUrl: "https://auth.example.com",
    cookieSecret: COOKIE_SECRET,
    serviceSecret: "service-secret-service-secret-service-secret",
    audience: "https://auth.example.com",
    jwksKid: "test-main",
  });
  await app.ready();

  return app;
}

/** The same table the Express adapter is held to, so the two cannot drift. */
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
      const app = await buildApp();

      await app.inject({
        method: "GET",
        url: `/auth${path}?${query}`,
        headers: { cookie: accessCookie() },
      });

      const [url] = global.fetch.mock.calls[0];
      const forwarded = new URL(url).searchParams;

      for (const [name, value] of new URLSearchParams(query)) {
        expect(forwarded.get(name)).toBe(value);
      }

      await app.close();
    },
  );
});
