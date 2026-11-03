// The guard on an adopter's own route runs the same origin check as the auth
// router and the Next.js guard, for a cookie session only (#256).
import express from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import request from "supertest";

const { requireAuth, requireRole } = await import("../dist/index.js");

const SECRET = "cookie-secret-cookie-secret-cookie-secret";
const INNER = jwt.sign({ sub: "user-1", typ: "access" }, "upstream-signing-key");
const cookie = () =>
  `seamless-access=${jwt.sign({ sub: "user-1", roles: ["admin"], token: INNER }, SECRET, { expiresIn: "1h" })}`;

const BLOCKED = { error: "cross_site_request_blocked" };
const LISTED = "https://app.example.com";

function createApp(options = {}, { role } = {}) {
  const app = express();
  app.use(cookieParser());
  const chain = [
    requireAuth({ cookieSecret: SECRET, ...options }),
    ...(role ? [requireRole(role)] : []),
  ];
  app.all("/api/thing", ...chain, (req, res) => res.json({ id: req.user.id }));
  return app;
}

function send(app, method, headers) {
  let req = request(app)[method]("/api/thing").set("Cookie", cookie());
  for (const [name, value] of Object.entries(headers)) req = req.set(name, value);
  return req;
}

describe("requireAuth origin check (express)", () => {
  it.each([["post"], ["put"], ["patch"], ["delete"]])(
    "refuses a cross-site %s on a cookie session",
    async (method) => {
      const res = await send(createApp(), method, { "Sec-Fetch-Site": "cross-site" });

      expect(res.status).toBe(403);
      expect(res.body).toEqual(BLOCKED);
    },
  );

  it("refuses a cross-site state change behind requireRole too", async () => {
    const res = await send(createApp({}, { role: "admin" }), "post", {
      "Sec-Fetch-Site": "cross-site",
    });

    expect(res.status).toBe(403);
    expect(res.body).toEqual(BLOCKED);
  });

  it("refuses a same-site state change from an unlisted Origin", async () => {
    const res = await send(createApp({ allowedOrigins: [LISTED] }), "post", {
      "Sec-Fetch-Site": "same-site",
      Origin: "https://sibling.example.com",
    });

    expect(res.status).toBe(403);
    expect(res.body).toEqual(BLOCKED);
  });

  it("refuses a literal null Origin", async () => {
    const res = await send(createApp(), "post", { Origin: "null" });

    expect(res.status).toBe(403);
    expect(res.body).toEqual(BLOCKED);
  });

  // Bearer and cookieless callers are not riding an ambient credential.
  it("skips the check when the request carries no session cookie", async () => {
    const res = await request(createApp())
      .post("/api/thing")
      .set("Sec-Fetch-Site", "cross-site");

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "unauthenticated" });
  });

  it("accepts a same-site state change from a listed Origin", async () => {
    const res = await send(createApp({ allowedOrigins: [LISTED] }), "post", {
      "Sec-Fetch-Site": "same-site",
      Origin: LISTED,
    });

    expect(res.status).toBe(200);
  });

  it("leaves a cross-site read alone", async () => {
    const res = await send(createApp(), "get", { "Sec-Fetch-Site": "cross-site" });

    expect(res.status).toBe(200);
  });

  it("asks for no JSON content type on the adopter's route", async () => {
    const res = await send(createApp(), "post", {
      "Sec-Fetch-Site": "same-origin",
      "Content-Type": "text/plain",
    });

    expect(res.status).toBe(200);
  });
});
