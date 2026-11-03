// A body-less form POST from a sibling subdomain, or from a browser that sends
// no fetch metadata, carries a SameSite=Lax cookie and must not reach a
// cookie-authenticated route (#256).
import { jest } from "@jest/globals";
import Fastify from "fastify";
import jwt from "jsonwebtoken";

const { default: seamlessAuth } = await import("../dist/index.js");

// Unsigned: the adapter only reads the inner token's type, the auth API verifies it.
const ACCESS_TOKEN = `e30.${Buffer.from(JSON.stringify({ typ: "access" })).toString("base64url")}.sig`;
const COOKIE_SECRET = "cookie-secret-cookie-secret-cookie-secret";

const accessCookie = () =>
  `seamless-access=${jwt.sign(
    { sub: "user-123", roles: ["user"], token: ACCESS_TOKEN },
    COOKIE_SECRET,
    { algorithm: "HS256", expiresIn: "300s" },
  )}`;

function upstream(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

const OPTIONS = {
  fetchManifest: false,
  authServerUrl: "https://auth.example.com",
  cookieSecret: COOKIE_SECRET,
  serviceSecret: "service-secret-service-secret-service-secret",
  audience: "https://auth.example.com",
  jwksKid: "test-main",
  cookieSameSite: "lax",
};

async function send({ method = "POST", path, headers, payload, options }) {
  const app = Fastify();
  await app.register(seamlessAuth, { prefix: "/auth", ...OPTIONS, ...options });
  await app.ready();
  try {
    const res = await app.inject({
      method,
      url: `/auth${path}`,
      headers: Object.fromEntries(
        Object.entries(headers).filter(([, value]) => value !== undefined),
      ),
      ...(payload === undefined ? {} : { payload }),
    });
    return {
      status: res.statusCode,
      body: res.body ? JSON.parse(res.body) : null,
      setCookie: res.headers["set-cookie"],
    };
  } finally {
    await app.close();
  }
}

function upstreamCalls(path) {
  return global.fetch.mock.calls.filter(
    ([url]) => String(url) === `https://auth.example.com${path}`,
  );
}

const SIBLING = "https://sibling.example.com";

describe("form POST CSRF with SameSite=Lax cookies (#256)", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn(async () => upstream(200, { codes: ["a"] }));
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it.each([
    ["same-site", "application/x-www-form-urlencoded"],
    ["same-site", "multipart/form-data; boundary=x"],
    ["same-site", "text/plain"],
    ["same-site", undefined],
    [undefined, "application/x-www-form-urlencoded"],
    [undefined, "text/plain"],
    [undefined, undefined],
  ])(
    "refuses a body-less POST with Sec-Fetch-Site %s and Content-Type %s",
    async (site, contentType) => {
      const res = await send({
        path: "/recovery-codes",
        headers: {
          cookie: accessCookie(),
          origin: SIBLING,
          "sec-fetch-site": site,
          "content-type": contentType,
        },
      });

      expect(upstreamCalls("/recovery-codes")).toHaveLength(0);
      expect(res.status).toBe(415);
      expect(res.body).toEqual({ error: "unsupported_media_type" });
    },
  );

  it("refuses a cross-site POST whatever the SameSite setting", async () => {
    const res = await send({
      path: "/recovery-codes",
      headers: {
        cookie: accessCookie(),
        "sec-fetch-site": "cross-site",
        "content-type": "application/json",
      },
      payload: "{}",
    });

    expect(upstreamCalls("/recovery-codes")).toHaveLength(0);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "cross_site_request_blocked" });
  });

  it.each([["same-site"], [undefined]])(
    "enforces allowedOrigins under Lax for Sec-Fetch-Site %s",
    async (site) => {
      const res = await send({
        path: "/recovery-codes",
        headers: {
          cookie: accessCookie(),
          origin: SIBLING,
          "sec-fetch-site": site,
          "content-type": "application/json",
        },
        payload: "{}",
        options: { allowedOrigins: ["https://app.example.com"] },
      });

      expect(upstreamCalls("/recovery-codes")).toHaveLength(0);
      expect(res.status).toBe(403);
    },
  );

  it("treats an empty allowedOrigins as configured", async () => {
    const res = await send({
      path: "/recovery-codes",
      headers: {
        cookie: accessCookie(),
        origin: "https://app.example.com",
        "sec-fetch-site": "same-site",
        "content-type": "application/json",
      },
      payload: "{}",
      options: { allowedOrigins: [] },
    });

    expect(upstreamCalls("/recovery-codes")).toHaveLength(0);
    expect(res.status).toBe(403);
  });

  it("accepts a same-origin body-less POST that declares JSON", async () => {
    const res = await send({
      path: "/recovery-codes",
      headers: {
        cookie: accessCookie(),
        "sec-fetch-site": "same-origin",
        "content-type": "application/json",
      },
    });

    expect(res.status).toBe(200);
    expect(upstreamCalls("/recovery-codes")).toHaveLength(1);
  });

  it("accepts a body-less POST that carries the transport header", async () => {
    const res = await send({
      path: "/recovery-codes",
      headers: {
        cookie: accessCookie(),
        "sec-fetch-site": "same-site",
        "x-seamless-auth-transport": "cookie",
      },
    });

    expect(res.status).toBe(200);
    expect(upstreamCalls("/recovery-codes")).toHaveLength(1);
  });

  it("refuses a body-less DELETE that declares nothing", async () => {
    const res = await send({
      method: "DELETE",
      path: "/sessions/s-1",
      headers: { cookie: accessCookie(), "sec-fetch-site": "same-origin" },
    });

    expect(res.status).toBe(415);
    expect(upstreamCalls("/sessions/s-1")).toHaveLength(0);
  });

  // The browser client up to now sends these bare, so they keep only the
  // origin check.
  it.each([
    ["POST", "/refresh"],
    ["DELETE", "/logout"],
    ["DELETE", "/logout/all"],
  ])("leaves %s %s out of the content-type gate", async (method, path) => {
    const res = await send({
      method,
      path,
      headers: { cookie: accessCookie(), "sec-fetch-site": "same-origin" },
    });

    expect(res.status).not.toBe(415);
  });

  it.each([["/logout"], ["/logout/all"]])(
    "still applies the origin check to DELETE %s, clearing no cookie",
    async (path) => {
      const res = await send({
        method: "DELETE",
        path,
        headers: { cookie: accessCookie(), "sec-fetch-site": "cross-site" },
      });

      expect(res.status).toBe(403);
      expect(res.setCookie ?? []).toEqual([]);
      expect(global.fetch).not.toHaveBeenCalled();
    },
  );
});
