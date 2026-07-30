// Runs the same requests through the Fastify and Express adapters against the
// same mocked auth API and compares what comes back. Two adapters agreeing is
// the only real check that the shared contract in core is doing the work.
import { jest } from "@jest/globals";
import express from "express";
import Fastify from "fastify";
import jwt from "jsonwebtoken";
import request from "supertest";

const { default: seamlessAuth, seamlessConsoleProxy } =
  await import("../dist/index.js");
const { default: createSeamlessAuthServer, createSeamlessConsoleProxy } =
  await import("../../express/dist/index.js");

const COOKIE_SECRET = "cookie-secret-cookie-secret-cookie-secret";
const SERVICE_SECRET = "service-secret-service-secret-service-secret";

const OPTIONS = {
  authServerUrl: "https://auth.example.com",
  cookieSecret: COOKIE_SECRET,
  serviceSecret: SERVICE_SECRET,
  audience: "https://auth.example.com",
  jwksKid: "test-main",
};

function upstream(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function signed(payload, ttl = "300s") {
  return jwt.sign(payload, COOKIE_SECRET, {
    algorithm: "HS256",
    expiresIn: ttl,
  });
}

const accessCookie = () =>
  `seamless-access=${signed({ sub: "user-123", roles: ["admin"], sessionId: "s-1", token: "access-token" })}`;
const preAuthCookie = () =>
  `seamless-ephemeral=${signed({ sub: "user-123", token: "pre-auth" })}`;

async function buildFastify(options = {}) {
  const app = Fastify();
  await app.register(seamlessAuth, { prefix: "/auth", ...OPTIONS, ...options });
  await app.ready();
  return app;
}

function buildExpress(options = {}) {
  const app = express();
  app.use("/auth", createSeamlessAuthServer({ ...OPTIONS, ...options }));
  return app;
}

// Cookie values are signed JWTs carrying iat/exp, so they differ per run. Keep
// the name and the attributes, which are what policy depends on.
function normalizeCookies(raw) {
  return (raw ?? [])
    .map((value) => {
      const [pair, ...attrs] = value.split("; ");
      const name = pair.slice(0, pair.indexOf("="));
      const body = pair.slice(pair.indexOf("=") + 1);
      return [
        `${name}=${body === "" ? "<cleared>" : "<signed>"}`,
        ...attrs
          .map((a) => (a.startsWith("Expires=") ? "Expires=<t>" : a))
          .sort(),
      ].join("; ");
    })
    .sort();
}

function parseBody(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function viaFastify({ method, path, cookie, payload, options }) {
  const app = await buildFastify(options);
  try {
    const res = await app.inject({
      method: method.toUpperCase(),
      url: `/auth${path}`,
      headers: cookie ? { cookie } : {},
      ...(payload === undefined ? {} : { payload }),
    });

    const raw = res.headers["set-cookie"];
    return {
      status: res.statusCode,
      body: parseBody(res.body),
      cookies: normalizeCookies(
        raw === undefined ? [] : Array.isArray(raw) ? raw : [raw],
      ),
    };
  } finally {
    await app.close();
  }
}

async function viaExpress({ method, path, cookie, payload, options }) {
  let req = request(buildExpress(options))[method](`/auth${path}`);
  if (cookie) req = req.set("Cookie", cookie);
  if (payload !== undefined) req = req.send(payload);

  const res = await req;

  return {
    status: res.status,
    body: parseBody(res.text),
    cookies: normalizeCookies(res.headers["set-cookie"]),
  };
}

async function bothAdapters(scenario, upstreamResponse) {
  global.fetch = jest.fn(async () => upstreamResponse);
  const fastify = await viaFastify(scenario);

  global.fetch = jest.fn(async () => upstreamResponse);
  const expressResult = await viaExpress(scenario);

  return { fastify, express: expressResult };
}

describe("fastify and express adapters agree", () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  const REFRESH_OK = {
    sub: "user-123",
    token: "new-access",
    refreshToken: "new-refresh",
    roles: ["admin"],
    email: "user@example.com",
    phone: null,
    ttl: 300,
    refreshTtl: 3600,
  };

  it.each([
    [
      "login failure forwards the upstream body",
      { method: "post", path: "/login", payload: { identifier: "a@b.c" } },
      upstream(400, { error: "account_locked" }),
    ],
    [
      "login failure keeps an OAuth sibling code",
      { method: "post", path: "/login", payload: { identifier: "a@b.c" } },
      upstream(400, {
        error: "oauth_profile_error",
        message: "Email not verified",
        code: "oauth_email_not_verified",
      }),
    ],
    [
      "login failure with a validation body",
      { method: "post", path: "/login", payload: { identifier: "a@b.c" } },
      upstream(400, { name: "ZodError", message: "bad" }),
    ],
    [
      "admin proxy normalizes a coded failure",
      {
        method: "patch",
        path: "/admin/users/user-1",
        cookie: accessCookie(),
        payload: { phone: "" },
      },
      upstream(400, { name: "ZodError", message: "bad" }),
    ],
    [
      "admin list success",
      { method: "get", path: "/admin/users", cookie: accessCookie() },
      upstream(200, { users: [] }),
    ],
    [
      "sessions list success",
      { method: "get", path: "/sessions", cookie: accessCookie() },
      upstream(200, { sessions: [] }),
    ],
    [
      "metrics dashboard success",
      {
        method: "get",
        path: "/internal/metrics/dashboard",
        cookie: accessCookie(),
      },
      upstream(200, { totals: {} }),
    ],
    [
      "system config roles success",
      { method: "get", path: "/system-config/roles", cookie: accessCookie() },
      upstream(200, { roles: ["admin"] }),
    ],
    [
      "passthrough proxy success",
      { method: "get", path: "/organizations", cookie: accessCookie() },
      upstream(200, { organizations: [] }),
    ],
    [
      "passthrough proxy forwards a 4xx",
      { method: "get", path: "/organizations", cookie: accessCookie() },
      upstream(403, { error: "forbidden" }),
    ],
    [
      "proxy without the required session",
      { method: "get", path: "/organizations" },
      upstream(200, {}),
    ],
    [
      "proxy with the wrong session kind",
      {
        method: "post",
        path: "/webAuthn/login/start",
        cookie: accessCookie(),
        payload: {},
      },
      upstream(200, {}),
    ],
    [
      "me with no user clears the preauth cookie",
      { method: "get", path: "/users/me", cookie: accessCookie() },
      upstream(200, {}),
    ],
    [
      "logout clears every session cookie",
      { method: "delete", path: "/logout", cookie: accessCookie() },
      upstream(200, {}),
    ],
    [
      "logout all clears every session cookie",
      { method: "delete", path: "/logout/all", cookie: accessCookie() },
      upstream(200, {}),
    ],
    [
      "oauth providers list",
      { method: "get", path: "/oauth/providers" },
      upstream(200, { providers: [] }),
    ],
  ])("%s", async (_label, scenario, upstreamResponse) => {
    const { fastify, express: expressResult } = await bothAdapters(
      scenario,
      upstreamResponse,
    );

    expect(fastify.status).toBe(expressResult.status);
    expect(fastify.body).toEqual(expressResult.body);
    expect(fastify.cookies).toEqual(expressResult.cookies);
  });

  it.each([
    ["default policy", {}],
    ["insecure dev", { cookieSecure: false }],
    ["custom domain", { cookieDomain: "acme.test" }],
    ["strict same-site", { cookieSameSite: "strict" }],
  ])("issues identical session cookies (%s)", async (_label, options) => {
    const scenario = {
      method: "get",
      path: "/users/me",
      cookie: `seamless-refresh=${signed({ sub: "user-123", refreshToken: "opaque" }, "3600s")}`,
      options,
    };

    global.fetch = jest.fn(async (url) =>
      String(url).endsWith("/refresh")
        ? upstream(200, REFRESH_OK)
        : upstream(200, { user: { id: "u1" } }),
    );
    const fastify = await viaFastify(scenario);

    global.fetch = jest.fn(async (url) =>
      String(url).endsWith("/refresh")
        ? upstream(200, REFRESH_OK)
        : upstream(200, { user: { id: "u1" } }),
    );
    const expressResult = await viaExpress(scenario);

    expect(fastify.cookies).toEqual(expressResult.cookies);
    expect(fastify.cookies.length).toBeGreaterThan(0);
    expect(fastify.status).toBe(expressResult.status);
  });

  it("sends the same upstream URL for a repeated query parameter", async () => {
    const urls = [];
    global.fetch = jest.fn(async (url) => {
      urls.push(String(url));
      return upstream(200, { events: [] });
    });

    const scenario = {
      method: "get",
      path: "/admin/auth-events?type=login&type=logout&limit=5",
      cookie: accessCookie(),
    };

    await viaFastify(scenario);
    await viaExpress(scenario);

    expect(urls[0]).toBe(urls[1]);
    expect(urls[0]).toContain("type=login&type=logout");
  });

  it("keeps an injected route param in one upstream path segment", async () => {
    const urls = [];
    global.fetch = jest.fn(async (url) => {
      urls.push(String(url));
      return upstream(200, {});
    });

    const scenario = {
      method: "patch",
      path: `/system-config/oauth-providers/${encodeURIComponent("abc?admin=1")}`,
      cookie: accessCookie(),
      payload: {},
    };

    await viaFastify(scenario);

    expect(urls[0]).toBe(
      "https://auth.example.com/system-config/oauth-providers/abc%3Fadmin%3D1",
    );
  });

  it("blocks a cross-site state change the same way", async () => {
    global.fetch = jest.fn(async () => upstream(200, {}));

    const app = await buildFastify();
    try {
      const res = await app.inject({
        method: "POST",
        url: "/auth/login",
        headers: { "sec-fetch-site": "cross-site" },
        payload: { identifier: "a@b.c" },
      });

      expect(res.statusCode).toBe(403);
      expect(JSON.parse(res.body)).toEqual({
        error: "cross_site_request_blocked",
      });
    } finally {
      await app.close();
    }
  });
});

function consoleUpstream(status, body, headers = {}) {
  const encoded = Buffer.from(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    body: {},
    arrayBuffer: async () =>
      encoded.buffer.slice(
        encoded.byteOffset,
        encoded.byteOffset + encoded.byteLength,
      ),
  };
}

function fetchedUrls() {
  return global.fetch.mock.calls.map(([url]) => url.toString());
}

async function viaFastifyConsole({ method, path, headers }) {
  const app = Fastify();
  await app.register(seamlessConsoleProxy, {
    prefix: "/console",
    authServerUrl: OPTIONS.authServerUrl,
  });
  await app.ready();

  try {
    const res = await app.inject({
      method: method.toUpperCase(),
      url: path,
      headers: headers ?? {},
    });

    return {
      status: res.statusCode,
      body: parseBody(res.body),
      contentType: res.headers["content-type"],
      cacheControl: res.headers["cache-control"],
    };
  } finally {
    await app.close();
  }
}

async function viaExpressConsole({ method, path, headers }) {
  const app = express();
  app.use(
    "/console",
    createSeamlessConsoleProxy({ authServerUrl: OPTIONS.authServerUrl }),
  );

  let req = request(app)[method](path);
  for (const [name, value] of Object.entries(headers ?? {})) {
    req = req.set(name, value);
  }

  const res = await req;

  return {
    status: res.status,
    body: parseBody(res.text),
    contentType: res.headers["content-type"],
    cacheControl: res.headers["cache-control"],
  };
}

async function bothConsoleAdapters(scenario, respondUpstream) {
  global.fetch = jest.fn(respondUpstream);
  const fastify = {
    ...(await viaFastifyConsole(scenario)),
    urls: fetchedUrls(),
  };

  global.fetch = jest.fn(respondUpstream);
  const expressResult = {
    ...(await viaExpressConsole(scenario)),
    urls: fetchedUrls(),
  };

  return { fastify, express: expressResult };
}

describe("fastify and express console proxies agree", () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  const ASSET = () =>
    consoleUpstream(200, "console.js()", {
      "content-type": "application/javascript",
      "cache-control": "public, max-age=31536000, immutable",
    });
  const SHELL = () =>
    consoleUpstream(200, "<!doctype html><div id=root>", {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    });
  const NOT_FOUND = () =>
    consoleUpstream(404, "Not found", { "content-type": "text/plain" });
  const UNREACHABLE = () => {
    throw new Error("network down");
  };

  it.each([
    [
      "asset request forwards the body and the caching headers",
      { method: "get", path: "/console/assets/x.js" },
      ASSET,
    ],
    [
      "deep client route gets the SPA shell",
      { method: "get", path: "/console/settings" },
      SHELL,
    ],
    [
      "query string is forwarded upstream",
      { method: "get", path: "/console/settings?tab=keys&tab=orgs" },
      SHELL,
    ],
    [
      "upstream 404 stays a 404",
      { method: "get", path: "/console/missing.js" },
      NOT_FOUND,
    ],
    [
      "a write to the console is refused",
      { method: "post", path: "/console/assets/x.js" },
      ASSET,
    ],
    [
      "encoded-slash traversal is refused",
      { method: "get", path: "/console/..%2fadmin/users" },
      ASSET,
    ],
    [
      "encoded-backslash traversal is refused",
      { method: "get", path: "/console/..%5cadmin" },
      ASSET,
    ],
    [
      "an unreachable upstream is a 502",
      { method: "get", path: "/console/assets/x.js" },
      UNREACHABLE,
    ],
  ])("%s", async (_label, scenario, respondUpstream) => {
    const { fastify, express: expressResult } = await bothConsoleAdapters(
      scenario,
      async () => respondUpstream(),
    );

    expect(fastify.status).toBe(expressResult.status);
    expect(fastify.body).toEqual(expressResult.body);
    expect(fastify.contentType).toBe(expressResult.contentType);
    expect(fastify.cacheControl).toBe(expressResult.cacheControl);
    expect(fastify.urls).toEqual(expressResult.urls);
  });

  // The two frameworks normalize dot-segments at different points, so the status
  // they answer with differs. What has to hold on both is that nothing outside
  // the console subtree is ever requested upstream.
  it.each([
    ["/console/../auth/admin/users"],
    ["/console/%2e%2e/auth/admin/users"],
    ["/console/assets/../../auth/admin/users"],
  ])("never proxies outside the console subtree (%s)", async (path) => {
    const { fastify, express: expressResult } = await bothConsoleAdapters(
      { method: "get", path },
      async () => NOT_FOUND(),
    );

    for (const url of [...fastify.urls, ...expressResult.urls]) {
      expect(url.startsWith("https://auth.example.com/console")).toBe(true);
    }

    expect(fastify.status).toBeGreaterThanOrEqual(400);
    expect(expressResult.status).toBeGreaterThanOrEqual(400);
  });
});
