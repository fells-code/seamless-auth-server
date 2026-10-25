// light-my-request resolves dot segments before routing, as browsers do, so
// these go over a real socket where a raw `%2e%2e` reaches the route params.
import { jest } from "@jest/globals";
import express from "express";
import Fastify from "fastify";
import jwt from "jsonwebtoken";
import http from "node:http";

const { default: seamlessAuth } = await import("../dist/index.js");
const { default: createSeamlessAuthServer } =
  await import("../../express/dist/index.js");

// Unsigned: the adapter only reads the inner token's type, the auth API verifies it.
const ACCESS_TOKEN = `e30.${Buffer.from(JSON.stringify({ typ: "access" })).toString("base64url")}.sig`;

const COOKIE_SECRET = "cookie-secret-cookie-secret-cookie-secret";

const OPTIONS = {
  fetchManifest: false,
  authServerUrl: "https://auth.example.com",
  cookieSecret: COOKIE_SECRET,
  serviceSecret: "service-secret-service-secret-service-secret",
  audience: "https://auth.example.com",
  jwksKid: "test-main",
};

const accessCookie = () =>
  `seamless-access=${jwt.sign(
    { sub: "user-123", roles: ["admin"], sessionId: "s-1", token: ACCESS_TOKEN },
    COOKIE_SECRET,
    { algorithm: "HS256", expiresIn: "300s" },
  )}`;

// Raw http.request, since supertest also resolves dot segments in the URL.
async function send(handler, method, path) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const body = method === "get" || method === "delete" ? undefined : "{}";

  try {
    return await new Promise((resolve, reject) => {
      const req = http.request(
        {
          host: "127.0.0.1",
          port: server.address().port,
          method: method.toUpperCase(),
          path: `/auth${path}`,
          headers: {
            cookie: accessCookie(),
            ...(body ? { "content-type": "application/json" } : {}),
          },
        },
        (res) => {
          let text = "";
          res.on("data", (chunk) => (text += chunk));
          res.on("end", () =>
            resolve({ status: res.statusCode, body: text && JSON.parse(text) }),
          );
        },
      );
      req.on("error", reject);
      req.end(body);
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

describe("dot-segment route params", () => {
  const originalFetch = global.fetch;
  let fastify;
  let fastifyHandler;

  beforeAll(async () => {
    fastify = Fastify();
    await fastify.register(seamlessAuth, { prefix: "/auth", ...OPTIONS });
    await fastify.ready();
    fastifyHandler = (req, res) => fastify.routing(req, res);
  });

  afterAll(async () => {
    await fastify.close();
  });

  beforeEach(() => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({}),
    }));
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  const expressApp = () => {
    const app = express();
    app.use("/auth", createSeamlessAuthServer(OPTIONS));
    return app;
  };

  it.each([
    ["get", "/organizations/%2e%2e"],
    ["patch", "/organizations/%2E/members/u1"],
    ["delete", "/organizations/org-1/members/%2e%2e"],
    ["patch", "/system-config/oauth-providers/%2e%2e"],
    ["get", "/admin/organizations/%2e%2e"],
    ["delete", "/sessions/%2e%2e"],
    ["get", "/admin/users/%2e%2e"],
    ["post", "/organizations/%2e%2e/switch"],
    ["get", "/magic-link/verify/%2e%2e"],
    ["post", "/oauth/%2e%2e/start"],
  ])("refuses %s %s without calling upstream", async (method, path) => {
    for (const server of [fastifyHandler, expressApp()]) {
      const res = await send(server, method, path);

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "bad_request" });
    }

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("still proxies a param that only contains dots", async () => {
    for (const server of [fastifyHandler, expressApp()]) {
      const res = await send(server, "get", "/organizations/a..b");
      expect(res.status).toBe(200);
    }

    expect(global.fetch.mock.calls.map(([url]) => String(url))).toEqual([
      "https://auth.example.com/organizations/a..b",
      "https://auth.example.com/organizations/a..b",
    ]);
  });
});
