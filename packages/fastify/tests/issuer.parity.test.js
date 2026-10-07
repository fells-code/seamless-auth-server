// The auth server can advertise an issuer that differs from the URL this
// server reaches it at: on the local Docker stack it signs as http://auth:5312
// while a host-run app calls http://localhost:5312 (fells-code/seamless-cli#224).
// The auth API sets both `iss` and `aud` to its ISSUER, so the tokens here do
// too, and a host-run app configures both `authServerIssuer` and `audience`.
// Drives the session-issuing flows through both adapters with and without
// `authServerIssuer` and holds them to the same answer.
import { jest } from "@jest/globals";
import express from "express";
import Fastify from "fastify";
import jwt from "jsonwebtoken";
import request from "supertest";
import { exportJWK, generateKeyPair, SignJWT } from "jose";

const { default: seamlessAuth } = await import("../dist/index.js");
const { default: createSeamlessAuthServer } = await import(
  "../../express/dist/index.js"
);

const AUTH = "http://localhost:5312";
const DOCKER_ISSUER = "http://auth:5312";
const COOKIE_SECRET = "cookie-secret-cookie-secret-cookie-secret";
const SERVICE_SECRET = "service-secret-service-secret-service-secret";

const OPTIONS = {
  authServerUrl: AUTH,
  cookieSecret: COOKIE_SECRET,
  serviceSecret: SERVICE_SECRET,
  audience: AUTH,
  jwksKid: "test-main",
  cookieSecure: false,
};

const { privateKey, publicKey } = await generateKeyPair("RS256");
const jwk = { ...(await exportJWK(publicKey)), alg: "RS256", kid: "k1", use: "sig" };

function signed(issuer, claims) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setIssuer(issuer)
    .setAudience(issuer)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);
}

// Answers as an auth server whose ISSUER is `issuer`: its tokens carry it as
// both `iss` and `aud`. Keys are only ever
// served from the URL the adapter was given, never from the issuer.
async function mockUpstream(issuer) {
  const ephemeral = await signed(issuer, { sub: "user-123", typ: "ephemeral" });
  const access = await signed(issuer, {
    sub: "user-123",
    typ: "access",
    sid: "s-1",
    roles: ["athlete"],
  });
  const calls = [];

  global.fetch = jest.fn(async (url, init = {}) => {
    const href = url.toString();
    calls.push(href);
    const json = (status, body) => ({
      ok: status < 400,
      status,
      text: async () => JSON.stringify(body),
    });

    if (href === `${AUTH}/.well-known/jwks.json`) {
      return new Response(JSON.stringify({ keys: [jwk] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (href === `${AUTH}/login`) {
      return json(200, {
        message: "Login continued",
        token: ephemeral,
        sub: "user-123",
        ttl: 300,
      });
    }
    if (href === `${AUTH}/otp/verify-login-email-otp`) {
      return json(200, {
        message: "Success",
        sub: "user-123",
        token: access,
        refreshToken: "refresh-1",
        roles: ["athlete"],
        email: "user@example.com",
        phone: null,
        ttl: 1800,
        refreshTtl: 2592000,
      });
    }
    throw new Error(`Unexpected upstream call: ${href}`);
  });

  return calls;
}

const preAuthCookie = () =>
  `seamless-ephemeral=${jwt.sign(
    { sub: "user-123", token: "pre-auth" },
    COOKIE_SECRET,
    { algorithm: "HS256", expiresIn: "300s" },
  )}`;

const DOCKER_OPTIONS = { authServerIssuer: DOCKER_ISSUER, audience: DOCKER_ISSUER };

const STEPS = [
  [
    "an OTP sign-in (cookie transport)",
    {
      method: "post",
      path: "/otp/verify-login-email-otp",
      cookie: preAuthCookie(),
      payload: { token: "ABCDEF" },
    },
  ],
  [
    "a login start (bearer transport)",
    {
      method: "post",
      path: "/login",
      headers: { "x-seamless-auth-transport": "bearer" },
      payload: { identifier: "a@b.c" },
    },
  ],
];

function cookieNames(raw) {
  const list = raw === undefined ? [] : Array.isArray(raw) ? raw : [raw];
  return list.map((value) => value.slice(0, value.indexOf("="))).sort();
}

async function viaFastify({ method, path, cookie, headers, payload }, options) {
  const app = Fastify();
  await app.register(seamlessAuth, { prefix: "/auth", ...OPTIONS, ...options });
  await app.ready();
  try {
    const res = await app.inject({
      method: method.toUpperCase(),
      url: `/auth${path}`,
      headers: { ...(headers ?? {}), ...(cookie ? { cookie } : {}) },
      payload,
    });
    return {
      status: res.statusCode,
      body: res.body ? JSON.parse(res.body) : null,
      cookies: cookieNames(res.headers["set-cookie"]),
    };
  } finally {
    await app.close();
  }
}

async function viaExpress({ method, path, cookie, headers, payload }, options) {
  const app = express();
  app.use("/auth", createSeamlessAuthServer({ ...OPTIONS, ...options }));
  let req = request(app)[method](`/auth${path}`);
  if (headers) req = req.set(headers);
  if (cookie) req = req.set("Cookie", cookie);
  const res = await req.send(payload);
  return {
    status: res.status,
    body: res.text ? JSON.parse(res.text) : null,
    cookies: cookieNames(res.headers["set-cookie"]),
  };
}

const ADAPTERS = [
  ["fastify", viaFastify],
  ["express", viaExpress],
];

describe("authServerIssuer", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    // A rejected response is logged by core and by each adapter's error path.
    jest.spyOn(console, "error").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  describe.each(ADAPTERS)("%s", (_name, run) => {
    it.each(STEPS)(
      "accepts %s signed by the URL when no issuer is configured",
      async (_label, step) => {
        await mockUpstream(AUTH);

        const res = await run(step, {});

        expect(res.status).toBe(200);
      },
    );

    it.each(STEPS)(
      "accepts %s signed by a configured issuer distinct from the URL",
      async (_label, step) => {
        const calls = await mockUpstream(DOCKER_ISSUER);

        const res = await run(step, DOCKER_OPTIONS);

        expect(res.status).toBe(200);
        expect(calls.every((href) => href.startsWith(`${AUTH}/`))).toBe(true);
      },
    );

    // The auth API's `aud` is its ISSUER, so an audience left at the URL
    // fails even with the issuer configured.
    it.each(STEPS)(
      "rejects %s when only the issuer is configured and audience stays the URL",
      async (_label, step) => {
        await mockUpstream(DOCKER_ISSUER);

        const res = await run(step, { authServerIssuer: DOCKER_ISSUER });

        expect(res.status).toBe(500);
        expect(res.cookies).not.toContain("seamless-access");
      },
    );

    it.each(STEPS)(
      "rejects %s from an issuer other than the expected one",
      async (_label, step) => {
        await mockUpstream(DOCKER_ISSUER);
        const unconfigured = await run(step, {});

        await mockUpstream(AUTH);
        const misconfigured = await run(step, DOCKER_OPTIONS);

        for (const res of [unconfigured, misconfigured]) {
          expect(res.status).toBe(500);
          expect(res.body).toEqual({ error: "internal_error" });
          expect(res.cookies).not.toContain("seamless-access");
          expect(res.cookies).not.toContain("seamless-refresh");
        }
      },
    );
  });

  it("sets the same session cookies from both adapters with a configured issuer", async () => {
    const [, step] = STEPS[0];

    await mockUpstream(DOCKER_ISSUER);
    const fastify = await viaFastify(step, DOCKER_OPTIONS);
    await mockUpstream(DOCKER_ISSUER);
    const expressResult = await viaExpress(step, DOCKER_OPTIONS);

    expect(fastify).toEqual(expressResult);
    expect(fastify.cookies).toEqual(
      expect.arrayContaining(["seamless-access", "seamless-refresh"]),
    );
  });
});
