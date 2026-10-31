import { readFileSync } from "node:fs";
import express from "express";
import request from "supertest";

const { createResourceServer, requireRole } = await import("../dist/index.js");

// Shared with the Go, Python and Rust adapters, which copy this file.
const vectors = JSON.parse(
  readFileSync(
    new URL(
      "../../core/tests/fixtures/verify-only/vectors.json",
      import.meta.url,
    ),
  ),
);

const api = createResourceServer({
  issuer: vectors.issuer,
  audience: vectors.audience,
  jwks: vectors.jwks,
  currentDate: () => new Date(vectors.now * 1000),
});

function guardFor(guard) {
  if (guard.kind === "scope") return api.requireScope(guard.scopes);
  if (guard.kind === "role") return api.requireRole(guard.roles);
  return api.requireStepUp({
    acrValues: guard.acr_values,
    amr: guard.amr,
    maxAge: guard.max_age,
  });
}

const app = express();
vectors.requests.forEach((entry, index) => {
  const guards = entry.guard ? [guardFor(entry.guard)] : [];
  app.get(`/vector/${index}`, api.requireAuth(), ...guards, (req, res) => {
    res.json({ sub: req.user.id, clientId: req.user.clientId });
  });
});

describe("Express resource server against the shared vectors", () => {
  it.each(vectors.requests.map((entry, index) => [entry.name, entry, index]))(
    "%s",
    async (_, entry, index) => {
      let call = request(app).get(`/vector/${index}`);
      if (entry.authorization !== null)
        call = call.set("Authorization", entry.authorization);
      const res = await call;

      expect(res.status).toBe(entry.expect.status);
      expect(res.headers["www-authenticate"] ?? null).toBe(
        entry.expect.www_authenticate,
      );
      if (entry.expect.body) expect(res.body).toEqual(entry.expect.body);
    },
  );
});

describe("Express resource server", () => {
  it("puts the verified user on req.user, where requireRole reads it", async () => {
    const server = express();
    server.get(
      "/me",
      api.requireAuth(),
      requireRole("orders:read"),
      (req, res) => {
        res.json(req.user);
      },
    );

    const res = await request(server)
      .get("/me")
      .set("Authorization", `Bearer ${vectors.tokens.user_passkey}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: "user-123",
      clientId: "app-web",
      scopes: ["openid", "orders:read", "orders:write"],
      sid: "sess-1",
      orgId: "org-9",
      acr: "phrh",
      amr: ["hwk", "user", "mfa"],
      authTime: vectors.now - 120,
    });
  });

  it("does not trust a req.user that another middleware set", async () => {
    const server = express();
    server.get(
      "/orders",
      (req, _res, next) => {
        req.user = { id: "user-1", roles: [], scopes: ["orders:write"] };
        next();
      },
      api.requireScope("orders:write"),
      (_req, res) => res.json({ ok: true }),
    );

    const res = await request(server).get("/orders");

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "missing_token" });
  });
});
