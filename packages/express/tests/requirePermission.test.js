import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";

import { definePermissionGuardSuite, providerConfig } from "../../core/tests/fixtures/permissionGuardSuite.js";

const { createResourceServer, requireAuth, requirePermission, setSeamlessLogger } =
  await import("../dist/index.js");

let warnings = [];
setSeamlessLogger({
  warn: (message) => warnings.push(message),
  error: () => {},
});
beforeEach(() => {
  warnings = [];
});

const reply = (req, res) => res.json({ user: req.user });

async function run(app, headers, organizationId) {
  const path = organizationId === undefined ? "/guarded" : `/orgs/${organizationId}`;
  let call = request(app).get(path);
  for (const [name, value] of Object.entries(headers)) call = call.set(name, value);
  const { status, body } = await call;
  return { status, body };
}

definePermissionGuardSuite("Express", {
  transports: ["cookie-only", "cookie", "bearer"],
  warnings: () => warnings,
  send({ config, headers, required, options, organizationId }) {
    const guards = [requireAuth(config), requirePermission(required, options)];
    const app = express();
    app.use(cookieParser());
    app.get("/guarded", ...guards, reply);
    app.get("/orgs/:organizationId", ...guards, reply);
    return run(app, headers, organizationId);
  },
  sendVerifyOnly({ token, required, options, organizationId }) {
    const api = createResourceServer(providerConfig);
    const guards = [api.requireAuth(), api.requirePermission(required, options)];
    const app = express();
    app.get("/guarded", ...guards, reply);
    app.get("/orgs/:organizationId", ...guards, reply);
    return run(app, token ? { authorization: `Bearer ${token}` } : {}, organizationId);
  },
});

describe("requirePermission behind a user another middleware set", () => {
  it("answers 401 with no user", async () => {
    const app = express();
    app.get("/guarded", requirePermission("a:read"), reply);

    const res = await request(app).get("/guarded");

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "unauthenticated" });
  });

  it("is not satisfied on a resource server by a user it did not verify", async () => {
    const api = createResourceServer(providerConfig);
    const app = express();
    app.use((req, _res, next) => {
      req.user = { id: "u", roles: [], permissions: ["a:read"] };
      next();
    });
    app.get("/guarded", api.requirePermission("a:read"), reply);

    const res = await request(app).get("/guarded");

    expect(res.status).toBe(401);
  });

  it("reads a segment wildcard parameter as missing", async () => {
    const app = express();
    app.use((req, _res, next) => {
      req.user = { id: "u", roles: [], organizationId: "a", organizationPermissions: ["a:read"] };
      next();
    });
    app.get(
      "/orgs/*organizationId",
      requirePermission("a:read", { organizationParam: "organizationId" }),
      reply,
    );

    const res = await request(app).get("/orgs/a");

    expect(res.status).toBe(403);
  });
});
