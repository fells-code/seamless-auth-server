import { readFileSync } from "node:fs";
import Fastify from "fastify";

const { createResourceServer } = await import("../dist/index.js");

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

const app = Fastify();
vectors.requests.forEach((entry, index) => {
  const guards = entry.guard ? [guardFor(entry.guard)] : [];
  app.get(
    `/vector/${index}`,
    { preHandler: [api.requireAuth(), ...guards] },
    async (req) => ({ sub: req.user.id, clientId: req.user.clientId }),
  );
});

afterAll(() => app.close());

describe("Fastify resource server against the shared vectors", () => {
  it.each(vectors.requests.map((entry, index) => [entry.name, entry, index]))(
    "%s",
    async (_, entry, index) => {
      const res = await app.inject({
        method: "GET",
        url: `/vector/${index}`,
        headers:
          entry.authorization === null
            ? {}
            : { authorization: entry.authorization },
      });

      expect(res.statusCode).toBe(entry.expect.status);
      expect(res.headers["www-authenticate"] ?? null).toBe(
        entry.expect.www_authenticate,
      );
      if (entry.expect.body) expect(res.json()).toEqual(entry.expect.body);
    },
  );
});

describe("Fastify resource server", () => {
  it("puts the verified provider claims on request.user", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/vector/5",
      headers: { authorization: `Bearer ${vectors.tokens.user_otp}` },
    });

    expect(res.json()).toEqual({ sub: "user-456", clientId: "app-web" });
  });

  it("does not trust a request.user that another hook set", async () => {
    const server = Fastify();
    server.get(
      "/orders",
      {
        preHandler: [
          async (req) => {
            req.user = { id: "user-1", roles: [], scopes: ["orders:write"] };
          },
          api.requireScope("orders:write"),
        ],
      },
      async () => ({ ok: true }),
    );

    const res = await server.inject({ method: "GET", url: "/orders" });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "missing_token" });
    await server.close();
  });
});
