import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import jwt from "jsonwebtoken";

import { testAuthServer } from "../../core/tests/fixtures/authServer.js";

const { requireAuth, requireRole } = await import("../dist/index.js");

const secret = "cookie-secret-cookie-secret-cookie-secret";
const server = testAuthServer("express-require-auth");
const originalFetch = global.fetch;

beforeEach(() => {
  global.fetch = server.fetch();
});

afterEach(() => {
  global.fetch = originalFetch;
});

const cookieFor = (payload) => jwt.sign(payload, secret, { expiresIn: "1h" });

function guarded(options = {}, ...after) {
  const app = express();
  app.use(cookieParser());
  app.use(
    requireAuth({
      cookieName: "access",
      cookieSecret: secret,
      ...server.guardOptions,
      ...options,
    }),
  );
  app.get("/protected", ...after, (req, res) => {
    res.json({ user: req.user });
  });
  return app;
}

describe("requireAuth (smoke)", () => {
  it("allows request and sets req.user when cookie is valid", async () => {
    const inner = await server.accessToken({ sub: "user-123" });
    const token = cookieFor({ sub: "user-123", token: inner });

    const res = await request(guarded())
      .get("/protected")
      .set("Cookie", [`access=${token}`]);

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe("user-123");
  });

  it("forwards the inner access token as req.user.token", async () => {
    const inner = await server.accessToken({ sub: "user-123" });
    const token = cookieFor({ sub: "user-123", token: inner });

    const res = await request(guarded())
      .get("/protected")
      .set("Cookie", [`access=${token}`]);

    expect(res.status).toBe(200);
    expect(res.body.user.token).toBe(inner);
  });

  // The pre-auth cookie /login issues for any existing account is signed with the
  // same secret, so a signature alone must not make a session.
  it("refuses a pre-auth cookie presented as the session cookie", async () => {
    const ephemeral = jwt.sign({ sub: "user-123", typ: "ephemeral" }, "upstream-signing-key");
    const token = cookieFor({ sub: "user-123", token: ephemeral });

    const res = await request(guarded()).get("/protected").set("Cookie", [`access=${token}`]);

    expect(res.status).toBe(401);
  });

  it("throws when constructed without authServerUrl and audience", () => {
    expect(() => requireAuth({ cookieSecret: secret })).toThrow(
      "requireAuth: authServerUrl and audience are required to verify access tokens",
    );
    expect(() => requireAuth({ cookieSecret: secret, authServerUrl: server.url })).toThrow(
      /authServerUrl and audience are required/,
    );
    expect(() =>
      requireAuth({ cookieSecret: secret, authServerUrl: "", audience: "" }),
    ).toThrow(/authServerUrl and audience are required/);
  });
});

// A leaked cookieSecret signs any cookie, so the cookie must not be able to say
// who the user is or what they hold (#284).
describe("requireAuth against a forged cookie", () => {
  it("refuses an inner token the auth API did not sign", async () => {
    const forged = jwt.sign(
      { sub: "user-1", typ: "access", roles: ["admin"] },
      "attacker-key",
    );
    const token = cookieFor({ sub: "user-1", roles: ["admin"], token: forged });

    const res = await request(guarded()).get("/protected").set("Cookie", [`access=${token}`]);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "unauthenticated" });
  });

  it("refuses a cookie whose sub is not the verified token's", async () => {
    const inner = await server.accessToken({ sub: "user-1" });
    const token = cookieFor({ sub: "someone-else", token: inner });

    const res = await request(guarded()).get("/protected").set("Cookie", [`access=${token}`]);

    expect(res.status).toBe(401);
  });

  it("takes roles, permissions and org from the verified token, not the cookie", async () => {
    const inner = await server.accessToken({
      roles: ["member"],
      permissions: ["a:read"],
      org_id: "org-a",
    });
    const token = cookieFor({
      sub: "user-1",
      roles: ["admin"],
      permissions: ["a:write"],
      organizationId: "org-b",
      token: inner,
    });

    const res = await request(guarded()).get("/protected").set("Cookie", [`access=${token}`]);

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      id: "user-1",
      roles: ["member"],
      permissions: ["a:read"],
      organizationId: "org-a",
    });
  });

  it("holds no role the verified token does not carry", async () => {
    const inner = await server.accessToken({ roles: undefined });
    const token = cookieFor({ sub: "user-1", roles: ["admin"], token: inner });

    const res = await request(guarded({}, requireRole("admin")))
      .get("/protected")
      .set("Cookie", [`access=${token}`]);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "insufficient_role" });
  });
});

describe("requireAuth and recovery sessions", () => {
  let token;

  beforeAll(async () => {
    const recovery = await server.accessToken({ recovery: true });
    token = cookieFor({ sub: "user-1", token: recovery });
  });

  it("refuses a recovery session with enrollment_required by default", async () => {
    const res = await request(guarded()).get("/protected").set("Cookie", [`access=${token}`]);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "enrollment_required" });
  });

  it("accepts it on a route that allows recovery sessions", async () => {
    const res = await request(guarded({ allowRecoverySession: true }))
      .get("/protected")
      .set("Cookie", [`access=${token}`]);

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe("user-1");
  });
});
