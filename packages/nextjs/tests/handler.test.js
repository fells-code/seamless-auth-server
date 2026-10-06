// Behavior the route handler owns because it has no framework underneath:
// mounting, routing, body parsing, client address forwarding, and error
// rendering. Behavior shared with the other adapters is in the parity suites.
import { jest } from "@jest/globals";
import jwt from "jsonwebtoken";

const { createSeamlessAuthHandler } = await import("../dist/index.js");

const COOKIE_SECRET = "cookie-secret-cookie-secret-cookie-secret";
const SERVICE_SECRET = "service-secret-service-secret-service-secret";

const OPTIONS = {
  authServerUrl: "https://auth.example.com",
  cookieSecret: COOKIE_SECRET,
  serviceSecret: SERVICE_SECRET,
  audience: "https://auth.example.com",
  jwksKid: "test-main",
};

const REFRESH_OK = {
  sub: "user-123",
  token: "new-access",
  refreshToken: "new-refresh",
  roles: [],
  ttl: 300,
  refreshTtl: 3600,
};

function upstream(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

const signed = (payload, ttl = "300s") =>
  jwt.sign(payload, COOKIE_SECRET, { algorithm: "HS256", expiresIn: ttl });

const accessCookie = () =>
  `seamless-access=${signed({ sub: "user-123", token: "access-token" })}`;
const refreshCookie = () =>
  `seamless-refresh=${signed({ sub: "user-123", refreshToken: "opaque" }, "3600s")}`;

function call(path, { method = "GET", headers = {}, body, options } = {}) {
  const handlers = createSeamlessAuthHandler({ ...OPTIONS, ...options });
  return handlers[method](
    new Request(`http://localhost${path}`, { method, headers, body }),
  );
}

describe("createSeamlessAuthHandler", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn(async () => upstream(200, { providers: [] }));
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("refuses to start with a weak secret", () => {
    expect(() =>
      createSeamlessAuthHandler({ ...OPTIONS, cookieSecret: "short" }),
    ).toThrow();
  });

  describe("routing", () => {
    it("serves routes relative to /auth by default", async () => {
      const res = await call("/auth/oauth/providers");

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ providers: [] });
      expect(global.fetch.mock.calls[0][0]).toBe(
        "https://auth.example.com/oauth/providers",
      );
    });

    it("serves routes relative to a custom basePath", async () => {
      const res = await call("/api/session/oauth/providers", {
        options: { basePath: "/api/session/" },
      });

      expect(res.status).toBe(200);
    });

    it("answers 404 for an unknown route, asking upstream nothing", async () => {
      const res = await call("/auth/not-a-route");

      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "not_found" });
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("answers 404 for a known path under the wrong method", async () => {
      const res = await call("/auth/oauth/providers", { method: "DELETE" });

      expect(res.status).toBe(404);
    });

    it("matches the WebAuthn routes case-insensitively, as Express does", async () => {
      const res = await call("/auth/webauthn/register/start", {
        headers: { cookie: accessCookie() },
      });

      expect(res.status).toBe(200);
      expect(global.fetch.mock.calls[0][0]).toBe(
        "https://auth.example.com/webAuthn/register/start",
      );
    });

    it("ignores a trailing slash", async () => {
      const res = await call("/auth/oauth/providers/");

      expect(res.status).toBe(200);
    });

    it("decodes a route param and keeps it in one upstream segment", async () => {
      await call(`/auth/admin/users/${encodeURIComponent("a/b?c")}`, {
        headers: { cookie: accessCookie() },
      });

      expect(global.fetch.mock.calls[0][0]).toBe(
        "https://auth.example.com/admin/users/a%2Fb%3Fc",
      );
    });

    it("marks every response as uncacheable", async () => {
      const res = await call("/auth/oauth/providers");

      expect(res.headers.get("cache-control")).toBe("no-store");
    });
  });

  describe("request bodies", () => {
    const post = (body, headers = {}) =>
      call("/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body,
      });

    it("answers 400 for malformed JSON, asking upstream nothing", async () => {
      const res = await post("{not json");

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "bad_request" });
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("answers 400 for a bare JSON primitive, as Express's strict parser does", async () => {
      const res = await post('"a@b.c"');

      expect(res.status).toBe(400);
    });

    it("answers 413 for a body over 100kb", async () => {
      const res = await post(
        JSON.stringify({ identifier: "x".repeat(101 * 1024) }),
      );

      expect(res.status).toBe(413);
      expect(await res.json()).toEqual({ error: "payload_too_large" });
    });

    it("ignores a body that is not JSON", async () => {
      global.fetch = jest.fn(async () => upstream(400, { error: "invalid" }));

      await call("/auth/login", {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: "identifier=a@b.c",
      });

      expect(global.fetch.mock.calls[0][1].body).toBeUndefined();
    });
  });

  describe("client address", () => {
    const forwardedIp = () =>
      global.fetch.mock.calls[0][1].headers["x-seamless-client-ip"];

    it("forwards none by default, whatever X-Forwarded-For says", async () => {
      await call("/auth/system-config/public", {
        headers: { "x-forwarded-for": "203.0.113.9" },
      });

      expect(forwardedIp()).toBeUndefined();
    });

    it("forwards what resolveClientIp returns", async () => {
      await call("/auth/system-config/public", {
        headers: { "x-real-ip": "203.0.113.9" },
        options: {
          resolveClientIp: (request) =>
            request.headers.get("x-real-ip") ?? undefined,
        },
      });

      expect(forwardedIp()).toBe("203.0.113.9");
    });

    it("drops a resolved value that is not an IP address", async () => {
      await call("/auth/system-config/public", {
        options: { resolveClientIp: () => "not-an-ip" },
      });

      expect(forwardedIp()).toBeUndefined();
    });
  });

  describe("errors", () => {
    it("answers 500 without leaking the failure", async () => {
      const spy = jest.spyOn(console, "error").mockImplementation(() => {});
      global.fetch = jest.fn(async () => {
        throw new Error("upstream exploded at /srv/secret/path");
      });

      const res = await call("/auth/oauth/providers");

      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: "internal_error" });
      spy.mockRestore();
    });

    // ensureCookies rotates the refresh token before the route runs. If the
    // route then fails and the rotated cookies are dropped, the browser keeps a
    // spent refresh token and its next refresh revokes the session.
    it("still delivers cookies a silent refresh rotated when the route fails", async () => {
      const spy = jest.spyOn(console, "error").mockImplementation(() => {});
      global.fetch = jest.fn(async (url) => {
        if (String(url).endsWith("/refresh")) return upstream(200, REFRESH_OK);
        throw new Error("upstream down");
      });

      const res = await call("/auth/users/me", {
        headers: { cookie: refreshCookie() },
      });

      expect(res.status).toBe(500);
      const names = res.headers
        .getSetCookie()
        .map((cookie) => cookie.slice(0, cookie.indexOf("=")));
      expect(names).toEqual(
        expect.arrayContaining(["seamless-access", "seamless-refresh"]),
      );
      spy.mockRestore();
    });
  });
});
