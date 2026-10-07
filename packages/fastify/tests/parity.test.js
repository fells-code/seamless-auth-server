// Runs the same requests through the Fastify and Express adapters against the
// same mocked auth API and compares what comes back. Two adapters agreeing is
// the only real check that the shared contract in core is doing the work.
import { jest } from "@jest/globals";
import express from "express";
import Fastify from "fastify";
import jwt from "jsonwebtoken";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
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

const { privateKey, publicKey } = await generateKeyPair("RS256");
const jwk = { ...(await exportJWK(publicKey)), alg: "RS256", kid: "k1", use: "sig" };

async function accessToken(claims, key = privateKey) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setIssuer(OPTIONS.authServerUrl)
    .setAudience(OPTIONS.audience)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(key);
}

const REFRESHED_ACCESS_TOKEN = await accessToken({
  sub: "user-123",
  typ: "access",
  sid: "s-2",
  roles: ["admin"],
});

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

async function viaFastify({ method, path, cookie, headers, payload, options }) {
  const app = await buildFastify(options);
  try {
    const res = await app.inject({
      method: method.toUpperCase(),
      url: `/auth${path}`,
      headers: { ...(headers ?? {}), ...(cookie ? { cookie } : {}) },
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

async function viaExpress({ method, path, cookie, headers, payload, options }) {
  let req = request(buildExpress(options))[method](`/auth${path}`);
  if (headers) req = req.set(headers);
  if (cookie) req = req.set("Cookie", cookie);
  if (payload !== undefined) req = req.send(payload);

  const res = await req;

  return {
    status: res.status,
    body: parseBody(res.text),
    cookies: normalizeCookies(res.headers["set-cookie"]),
  };
}

// The auth API for a silent refresh: rotates the session, publishes the key
// set the rotated token is verified against, and answers the route itself.
function refreshUpstream(refreshBody) {
  return jest.fn(async (url) => {
    const href = String(url);
    if (href.endsWith("/.well-known/jwks.json")) {
      return upstream(200, { keys: [jwk] });
    }
    if (href.endsWith("/refresh")) return upstream(200, refreshBody);
    return upstream(200, { user: { id: "u1" } });
  });
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
    token: REFRESHED_ACCESS_TOKEN,
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
      "metrics funnel success",
      {
        method: "get",
        path: "/internal/metrics/funnel?from=2026-01-01&to=2026-02-01",
        cookie: accessCookie(),
      },
      upstream(200, { passkeyAdoption: { users: 5, withPasskey: 3 } }),
    ],
    [
      "metrics funnel without the required session",
      { method: "get", path: "/internal/metrics/funnel" },
      upstream(200, {}),
    ],
    [
      "metrics sign-ins success",
      {
        method: "get",
        path: "/internal/metrics/sign-ins?from=2026-01-01&to=2026-02-01",
        cookie: accessCookie(),
      },
      upstream(200, { signIns: { success: 371, failed: 21 }, breakdown: [] }),
    ],
    [
      "metrics sign-ins without the required session",
      { method: "get", path: "/internal/metrics/sign-ins" },
      upstream(200, {}),
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
      "admin review accounts forwards the report",
      {
        method: "get",
        path: "/admin/review-accounts",
        cookie: accessCookie(),
      },
      upstream(200, {
        enabled: true,
        emails: ["review@example.com"],
        codeConfigured: true,
        recentSignIns: {
          days: 30,
          count: 2,
          failedVerifications: 0,
          lastSignInAt: null,
        },
      }),
    ],
    [
      "admin audit integrity forwards the report",
      {
        method: "get",
        path: "/admin/auth-events/integrity",
        cookie: accessCookie(),
      },
      upstream(200, { verified: true, rowsChecked: 3, firstFailure: null }),
    ],
    [
      "admin enrollment invite forwards the body",
      {
        method: "post",
        path: "/admin/enrollment/invites",
        cookie: accessCookie(),
        payload: { organizationId: "org-1" },
      },
      upstream(200, { sent: 1, skipped: 0, results: [] }),
    ],
    [
      "admin organization delete success",
      {
        method: "delete",
        path: "/admin/organizations/org-1",
        cookie: accessCookie(),
      },
      upstream(200, { message: "Success" }),
    ],
    [
      "admin organization delete forwards a 404",
      {
        method: "delete",
        path: "/admin/organizations/org-1",
        cookie: accessCookie(),
      },
      upstream(404, { error: "Organization not found" }),
    ],
    [
      "admin OAuth provider retirement success",
      {
        method: "put",
        path: "/admin/organizations/org-1/oauth-providers/legacy-idp/retirement",
        cookie: accessCookie(),
      },
      upstream(200, { organization: { id: "org-1" } }),
    ],
    [
      "admin OAuth provider restore success",
      {
        method: "delete",
        path: "/admin/organizations/org-1/oauth-providers/legacy-idp/retirement",
        cookie: accessCookie(),
      },
      upstream(200, { organization: { id: "org-1" } }),
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
      "deleting the account clears every session cookie",
      { method: "delete", path: "/users/delete", cookie: accessCookie() },
      upstream(200, { message: "User deleted" }),
    ],
    [
      "oauth providers list",
      { method: "get", path: "/oauth/providers" },
      upstream(200, { providers: [] }),
    ],
    [
      "public system config with no cookie",
      { method: "get", path: "/system-config/public" },
      upstream(200, { loginMethods: ["passkey", "magic_link"] }),
    ],
    [
      "public system config passes an upstream failure through",
      { method: "get", path: "/system-config/public" },
      upstream(503, { error: "upstream_unavailable" }),
    ],
    [
      "passkey enrollment start on an access session",
      {
        method: "get",
        path: "/webAuthn/register/start",
        cookie: accessCookie(),
      },
      upstream(200, { challenge: "challenge" }),
    ],
    // Enrollment moved off the pre-auth cookie because the auth API mints
    // one for an account that already exists from an email address alone.
    // Both adapters have to refuse it, or the one that does not hands the
    // account over.
    [
      "passkey enrollment start refuses a pre-auth session",
      {
        method: "get",
        path: "/webAuthn/register/start",
        cookie: preAuthCookie(),
      },
      upstream(200, { challenge: "challenge" }),
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

  // The parity case above proves the two adapters agree on this, not what they
  // agree on, so it passed just as happily when both answered 400. The status
  // itself is the contract a consumer reads to tell "sign in again" from "that
  // request was not understood", so it is pinned here by value.
  it.each([
    [
      "an access-gated route with no session",
      { method: "get", path: "/organizations" },
    ],
    [
      "a pre-auth gated route with no session",
      { method: "post", path: "/webAuthn/login/start", payload: {} },
    ],
    [
      "an enrollment route with no session",
      { method: "get", path: "/webAuthn/register/start" },
    ],
    [
      "an enrollment route holding only a pre-auth session",
      {
        method: "get",
        path: "/webAuthn/register/start",
        cookie: preAuthCookie(),
      },
    ],
  ])(
    "answers 401 on %s, and asks upstream nothing",
    async (_label, scenario) => {
      const upstreamResponse = upstream(200, {});

      global.fetch = jest.fn(async () => upstreamResponse);
      const fastifyResult = await viaFastify(scenario);
      const fastifyCalls = global.fetch.mock.calls.length;

      global.fetch = jest.fn(async () => upstreamResponse);
      const expressResult = await viaExpress(scenario);

      expect(fastifyResult.status).toBe(401);
      expect(expressResult.status).toBe(401);
      expect(fastifyCalls).toBe(0);
      expect(global.fetch.mock.calls.length).toBe(0);
    },
  );

  // The sign-in screens call this with no session at all. Forwarding an identity
  // would be pointless on a route upstream serves publicly, and it would put a
  // stale cookie in the path of the one call a signed-out client has to make.
  // Asserted with a valid cookie present so a future refactor cannot quietly
  // start attaching one.
  it("refuses a pre-auth route that has only a refresh cookie, without asking upstream", async () => {
    const scenario = {
      method: "post",
      path: "/webAuthn/login/start",
      cookie: `seamless-refresh=${signed({ sub: "user-123", refreshToken: "opaque" }, "3600s")}`,
      payload: {},
    };
    const { fastify, express: expressResult } = await bothAdapters(
      scenario,
      upstream(200, REFRESH_OK),
    );

    for (const result of [fastify, expressResult]) {
      expect(result.status).toBe(401);
      expect(
        result.cookies.some((cookie) =>
          cookie.startsWith("seamless-ephemeral=<signed>"),
        ),
      ).toBe(false);
    }
    expect(global.fetch).not.toHaveBeenCalled();
    expect(fastify).toEqual(expressResult);
  });

  it("sends no identity upstream for the public system config", async () => {
    // One explicit user agent for both, since light-my-request sends a default
    // and supertest sends none, and that difference would show up as a header
    // one adapter forwards and the other does not.
    const scenario = {
      method: "get",
      path: "/system-config/public",
      cookie: accessCookie(),
      headers: { "user-agent": "Mozilla/5.0 (parity)" },
    };
    const upstreamResponse = upstream(200, { loginMethods: ["passkey"] });

    const headersFor = async (runner) => {
      global.fetch = jest.fn(async () => upstreamResponse);
      await runner(scenario);

      const [, init] = global.fetch.mock.calls[0];

      return Object.fromEntries(
        Object.entries(init?.headers ?? {}).map(([key, value]) => [
          key.toLowerCase(),
          value,
        ]),
      );
    };

    const fastifyHeaders = await headersFor(viaFastify);
    const expressHeaders = await headersFor(viaExpress);

    for (const headers of [fastifyHeaders, expressHeaders]) {
      expect(headers.authorization).toBeUndefined();
      expect(headers["x-seamless-service-token"]).toBeUndefined();
    }

    // Not a full header comparison: the two frameworks report the loopback
    // address differently (127.0.0.1 against ::ffff:127.0.0.1), which is the
    // test socket rather than anything either adapter decides.
    expect(Object.keys(fastifyHeaders).sort()).toEqual(
      Object.keys(expressHeaders).sort(),
    );
  });

  // The auth API records the user agent on every audit row and folds it into a
  // device class, so both adapters have to hand it the browser's rather than
  // their own.
  it("forwards the browser user agent to upstream from both adapters", async () => {
    const browser =
      "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
    const scenario = {
      method: "post",
      path: "/login",
      headers: { "user-agent": browser },
      payload: { identifier: "user@example.com" },
    };
    const upstreamResponse = upstream(200, {
      token: "ephemeral",
      sub: "user-1",
      ttl: 300,
      loginMethods: ["passkey"],
    });

    const headerFor = async (runner) => {
      global.fetch = jest.fn(async () => upstreamResponse);
      await runner(scenario);

      const [, init] = global.fetch.mock.calls[0];

      return init?.headers?.["x-seamless-client-user-agent"];
    };

    expect(await headerFor(viaFastify)).toBe(browser);
    expect(await headerFor(viaExpress)).toBe(browser);
  });

  // The auth API's registration response sends `ttl` as the string "300". Every
  // scenario in this file hand-writes a number, so the suite agreed on input the
  // real upstream does not send: Express coerced the string by multiplying into
  // milliseconds, Fastify handed it to `cookie` and got a TypeError, and
  // registration failed on Fastify only.
  it("issues identical session cookies when upstream sends ttl as a string", async () => {
    const scenario = {
      method: "post",
      path: "/registration/register",
      payload: { email: "user@example.com" },
    };
    const upstreamResponse = upstream(200, {
      message: "Registration started",
      sub: "user-123",
      token: "registration-token",
      ttl: "300",
    });

    const { fastify, express: expressResult } = await bothAdapters(
      scenario,
      upstreamResponse,
    );

    expect(fastify.status).toBe(200);
    expect(fastify.status).toBe(expressResult.status);
    expect(fastify.cookies).toEqual(expressResult.cookies);
    expect(fastify.cookies.length).toBeGreaterThan(0);
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

    global.fetch = refreshUpstream(REFRESH_OK);
    const fastify = await viaFastify(scenario);

    global.fetch = refreshUpstream(REFRESH_OK);
    const expressResult = await viaExpress(scenario);

    expect(fastify.status).toBe(200);
    expect(fastify.cookies).toEqual(expressResult.cookies);
    expect(fastify.cookies).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^seamless-access=<signed>/),
        expect.stringMatching(/^seamless-refresh=<signed>/),
      ]),
    );
    expect(fastify.status).toBe(expressResult.status);
  });

  // Every other flow verifies the token the auth API returns before minting a
  // session from it. The silent refresh must too: the access cookie is signed
  // with the adopter's own secret, and its roles are trusted on every later
  // request without asking the auth API again.
  it.each([
    [
      "signed by a key the auth server does not publish",
      async () =>
        accessToken(
          { sub: "user-123", typ: "access", roles: ["admin"] },
          (await generateKeyPair("RS256")).privateKey,
        ),
    ],
    ["not a JWT at all", async () => "forged-access"],
    [
      "for a different subject than the body",
      async () => accessToken({ sub: "someone-else", typ: "access" }),
    ],
  ])("refuses a silent refresh whose token is %s", async (label, forge) => {
    const scenario = {
      method: "get",
      path: "/users/me",
      cookie: `seamless-refresh=${signed({ sub: "user-123", refreshToken: `forged-${label}` }, "3600s")}`,
    };
    const forged = { ...REFRESH_OK, token: await forge(), roles: ["admin"] };
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});

    try {
      global.fetch = refreshUpstream(forged);
      const fastify = await viaFastify(scenario);
      const fastifyCalls = global.fetch.mock.calls.map(([url]) => String(url));

      global.fetch = refreshUpstream(forged);
      const expressResult = await viaExpress(scenario);

      expect(fastify.status).toBe(401);
      expect(fastify.status).toBe(expressResult.status);
      expect(fastify.body).toEqual(expressResult.body);
      expect(fastify.cookies).toEqual(expressResult.cookies);
      expect(fastify.cookies.some((c) => c.includes("=<signed>"))).toBe(false);
      expect(fastifyCalls.some((url) => url.endsWith("/users/me"))).toBe(false);
    } finally {
      spy.mockRestore();
    }
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

// A browser sends the magic link destination in the body; the auth API wants it as a
// query parameter on a GET. Asserted on both adapters because each reads its own
// request body, so only the forwarding underneath them is shared.
describe("both adapters forward a magic link destination", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  async function upstreamUrl(run, payload) {
    let requested;

    global.fetch = jest.fn(async (url) => {
      requested = String(url);
      return upstream(200, { message: "sent" });
    });

    await run({
      method: "post",
      path: "/magic-link",
      cookie: preAuthCookie(),
      payload,
    });

    return requested;
  }

  it("sends a requested target as a query parameter", async () => {
    const payload = { redirectUri: "https://app.example.com/magic" };

    const viaF = await upstreamUrl(viaFastify, payload);
    const viaE = await upstreamUrl(viaExpress, payload);

    expect(viaF).toBe(viaE);
    expect(new URL(viaF).searchParams.get("redirectUri")).toBe(
      "https://app.example.com/magic",
    );
  });

  it("asks for the tenant default when no target is given", async () => {
    const viaF = await upstreamUrl(viaFastify, {});
    const viaE = await upstreamUrl(viaExpress, {});

    expect(viaF).toBe(viaE);
    expect(viaF).toBe("https://auth.example.com/magic-link");
  });
});

async function viaFastifyRaw({ method, path, cookie }) {
  const app = await buildFastify();
  try {
    const res = await app.inject({
      method: method.toUpperCase(),
      url: `/auth${path}`,
      headers: cookie ? { cookie } : {},
    });
    return {
      status: res.statusCode,
      text: res.body,
      contentType: res.headers["content-type"],
      disposition: res.headers["content-disposition"],
    };
  } finally {
    await app.close();
  }
}

async function viaExpressRaw({ method, path, cookie }) {
  let req = request(buildExpress())[method](`/auth${path}`).buffer(true);
  req = req.parse((res, done) => {
    let text = "";
    res.setEncoding("utf8");
    res.on("data", (chunk) => (text += chunk));
    res.on("end", () => done(null, text));
  });
  if (cookie) req = req.set("Cookie", cookie);
  const res = await req;
  return {
    status: res.status,
    text: res.body,
    contentType: res.headers["content-type"],
    disposition: res.headers["content-disposition"],
  };
}

// Downloads are forwarded as bytes with the headers that make them a file. A JSON
// round trip would wrap the body in { message } and drop the attachment header.
describe("fastify and express forward downloads unparsed", () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  const NDJSON = '{"seq":1,"hash":"a"}\n{"type":"manifest","count":1}\n';
  const CSV = 'Section,Field,Value\r\nCoverage,"Users, active",3\r\n';

  function download(status, text, headers) {
    return () => new Response(text, { status, headers });
  }

  async function rawVia(adapter, scenario, respond) {
    global.fetch = jest.fn(async () => respond());
    return adapter(scenario);
  }

  it.each([
    [
      "NDJSON audit export",
      "/admin/auth-events/export?from=2026-01-01T00:00:00Z",
      download(200, NDJSON, {
        "content-type": "application/x-ndjson; charset=utf-8",
        "content-disposition": 'attachment; filename="auth-events.ndjson"',
        "cache-control": "no-store",
      }),
      "application/x-ndjson",
      NDJSON,
    ],
    [
      "CSV coverage report",
      "/admin/reports/authentication-coverage?format=csv",
      download(200, CSV, {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": 'attachment; filename="coverage.csv"',
      }),
      "text/csv",
      CSV,
    ],
    [
      "JSON error from a download route",
      "/admin/auth-events/export",
      download(403, '{"error":"step_up_required"}', {
        "content-type": "application/json; charset=utf-8",
      }),
      "application/json",
      '{"error":"step_up_required"}',
    ],
  ])("%s", async (_name, path, respond, contentType, text) => {
    const scenario = { method: "get", path, cookie: accessCookie() };

    const other = await rawVia(viaFastifyRaw, scenario, respond);
    const expressResult = await rawVia(viaExpressRaw, scenario, respond);

    for (const result of [other, expressResult]) {
      expect(result.text).toBe(text);
      expect(result.contentType).toContain(contentType);
    }
    expect(other.status).toBe(expressResult.status);
    expect(other.disposition).toBe(expressResult.disposition);
    const [upstreamUrl] = global.fetch.mock.calls[0];
    expect(upstreamUrl).toMatch(
      new RegExp(`^https://auth\\.example\\.com${path.split("?")[0]}`),
    );
  });
});
