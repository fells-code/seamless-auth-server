import { readFileSync } from "node:fs";

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

function requirementsFor(guard) {
  if (!guard) return undefined;
  if (guard.kind === "scope") return { scopes: guard.scopes };
  if (guard.kind === "role") return { roles: guard.roles };
  return {
    stepUp: {
      acrValues: guard.acr_values,
      amr: guard.amr,
      maxAge: guard.max_age,
    },
  };
}

function get(authorization) {
  return new Request("https://api.example.test/orders", {
    headers: authorization === null ? {} : { authorization },
  });
}

describe("Next.js resource server against the shared vectors", () => {
  it.each(vectors.requests.map((entry) => [entry.name, entry]))(
    "%s",
    async (_, entry) => {
      const handler = api.protect(
        (_request, _context, user) => Response.json({ sub: user.id }),
        requirementsFor(entry.guard),
      );
      const res = await handler(get(entry.authorization), {});

      expect(res.status).toBe(entry.expect.status);
      expect(res.headers.get("www-authenticate")).toBe(
        entry.expect.www_authenticate,
      );
      if (entry.expect.body)
        expect(await res.json()).toEqual(entry.expect.body);
    },
  );
});

describe("Next.js resource server", () => {
  it("hands the handler the verified user and its route context", async () => {
    const handler = api.protect(
      (_request, context, user) =>
        Response.json({ params: context.params, user }),
      { scopes: "orders:write", stepUp: { acrValues: ["phrh"] } },
    );
    const res = await handler(get(`Bearer ${vectors.tokens.user_passkey}`), {
      params: { id: "o-1" },
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.params).toEqual({ id: "o-1" });
    expect(body.user).toMatchObject({
      id: "user-123",
      acr: "phrh",
      orgId: "org-9",
    });
  });

  it("returns the response to send from authenticate", async () => {
    const result = await api.authenticate(
      get(`Bearer ${vectors.tokens.user_otp}`),
      {
        roles: "admin",
      },
    );

    expect(result.user).toBeUndefined();
    expect(result.response.status).toBe(403);
  });

  it("fails at setup for a step-up requirement that asks for nothing", () => {
    expect(() => api.protect(() => new Response(), { stepUp: {} })).toThrow(
      /stepUp/,
    );
  });
});
