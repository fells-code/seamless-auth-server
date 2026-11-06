import cookie from "@fastify/cookie";
import Fastify from "fastify";

import { definePermissionGuardSuite, providerConfig } from "../../core/tests/fixtures/permissionGuardSuite.js";

const { createResourceServer, requireAuth, requirePermission, setSeamlessLogger } =
  await import("../dist/index.js");

let warnings = [];
setSeamlessLogger({ warn: () => {}, error: () => {} });
beforeEach(() => {
  warnings = [];
});

function buildApp(preHandler) {
  const app = Fastify({
    logger: { level: "warn", stream: { write: (line) => warnings.push(line) } },
  });
  app.register(cookie);
  const reply = async (req) => ({ user: req.user });
  app.get("/guarded", { preHandler }, reply);
  app.get("/orgs/:organizationId", { preHandler }, reply);
  return app;
}

async function run(app, headers, organizationId) {
  const res = await app.inject({
    method: "GET",
    url: organizationId === undefined ? "/guarded" : `/orgs/${organizationId}`,
    headers,
  });
  return { status: res.statusCode, body: res.json() };
}

definePermissionGuardSuite("Fastify", {
  transports: ["cookie-only", "cookie", "bearer"],
  warnings: () => warnings,
  send({ config, headers, required, options, organizationId }) {
    return run(
      buildApp([requireAuth(config), requirePermission(required, options)]),
      headers,
      organizationId,
    );
  },
  sendVerifyOnly({ token, required, options, organizationId }) {
    const api = createResourceServer(providerConfig);
    return run(
      buildApp([api.requireAuth(), api.requirePermission(required, options)]),
      token ? { authorization: `Bearer ${token}` } : {},
      organizationId,
    );
  },
});

describe("requirePermission with no session on the request", () => {
  it("answers 401", async () => {
    const res = await run(buildApp([requirePermission("a:read")]), {});

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "unauthenticated" });
  });

  it("is not satisfied on a resource server by a user it did not verify", async () => {
    const api = createResourceServer(providerConfig);
    const app = Fastify();
    app.addHook("preHandler", async (req) => {
      req.user = { id: "u", roles: [], permissions: ["a:read"] };
    });
    app.get("/guarded", { preHandler: api.requirePermission("a:read") }, async () => ({}));

    const res = await app.inject({ method: "GET", url: "/guarded" });

    expect(res.statusCode).toBe(401);
  });
});
