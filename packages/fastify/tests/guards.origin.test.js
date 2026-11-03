// The guard on an adopter's own route runs the same origin check as the auth
// plugin and the Next.js guard, for a cookie session only (#256).
import cookiePlugin from "@fastify/cookie";
import Fastify from "fastify";
import jwt from "jsonwebtoken";

const { requireAuth, requireRole } = await import("../dist/index.js");

const SECRET = "cookie-secret-cookie-secret-cookie-secret";
const INNER = jwt.sign({ sub: "user-1", typ: "access" }, "upstream-signing-key");
const cookie = () =>
  `seamless-access=${jwt.sign({ sub: "user-1", roles: ["admin"], token: INNER }, SECRET, { expiresIn: "1h" })}`;

const BLOCKED = { error: "cross_site_request_blocked" };
const LISTED = "https://app.example.com";

async function send(method, headers, options = {}, { role } = {}) {
  const app = Fastify();
  await app.register(cookiePlugin);
  const guard = requireAuth({ cookieSecret: SECRET, ...options });
  app.route({
    method: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    url: "/api/thing",
    preHandler: role ? [guard, requireRole(role)] : guard,
    handler: async (req) => ({ id: req.user.id }),
  });
  await app.ready();
  try {
    const res = await app.inject({
      method,
      url: "/api/thing",
      headers: { cookie: cookie(), ...headers },
    });
    return { status: res.statusCode, body: res.json() };
  } finally {
    await app.close();
  }
}

describe("requireAuth origin check (fastify)", () => {
  it.each([["POST"], ["PUT"], ["PATCH"], ["DELETE"]])(
    "refuses a cross-site %s on a cookie session",
    async (method) => {
      const res = await send(method, { "sec-fetch-site": "cross-site" });

      expect(res.status).toBe(403);
      expect(res.body).toEqual(BLOCKED);
    },
  );

  it("refuses a cross-site state change behind requireRole too", async () => {
    const res = await send("POST", { "sec-fetch-site": "cross-site" }, {}, { role: "admin" });

    expect(res.status).toBe(403);
    expect(res.body).toEqual(BLOCKED);
  });

  it("refuses a same-site state change from an unlisted Origin", async () => {
    const res = await send(
      "POST",
      { "sec-fetch-site": "same-site", origin: "https://sibling.example.com" },
      { allowedOrigins: [LISTED] },
    );

    expect(res.status).toBe(403);
    expect(res.body).toEqual(BLOCKED);
  });

  it("refuses a literal null Origin", async () => {
    const res = await send("POST", { origin: "null" });

    expect(res.status).toBe(403);
    expect(res.body).toEqual(BLOCKED);
  });

  // Bearer and cookieless callers are not riding an ambient credential.
  it("skips the check when the request carries no session cookie", async () => {
    const res = await send("POST", { "sec-fetch-site": "cross-site", cookie: "" });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "unauthenticated" });
  });

  it("accepts a same-site state change from a listed Origin", async () => {
    const res = await send(
      "POST",
      { "sec-fetch-site": "same-site", origin: LISTED },
      { allowedOrigins: [LISTED] },
    );

    expect(res.status).toBe(200);
  });

  it("leaves a cross-site read alone", async () => {
    const res = await send("GET", { "sec-fetch-site": "cross-site" });

    expect(res.status).toBe(200);
  });

  it("asks for no JSON content type on the adopter's route", async () => {
    const res = await send("POST", {
      "sec-fetch-site": "same-origin",
      "content-type": "text/plain",
    });

    expect(res.status).toBe(200);
  });
});
