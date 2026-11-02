import express from "express";
import request from "supertest";

const { requireRole } = await import("../dist/index.js");

function appWithRoles(roles) {
  const app = express();

  app.use((req, _res, next) => {
    req.user = { id: "user-1", roles };
    next();
  });

  app.get("/protected", requireRole("admin:read"), (_req, res) => {
    res.json({ ok: true });
  });

  app.post("/protected", requireRole("admin:write"), (_req, res) => {
    res.json({ ok: true });
  });

  return app;
}

describe("requireRole", () => {
  it("allows a scoped read role on read routes", async () => {
    const res = await request(appWithRoles(["admin:read"])).get("/protected");

    expect(res.status).toBe(200);
  });

  it("allows a scoped write role on read and write routes", async () => {
    const app = appWithRoles(["admin:write"]);

    await expect(request(app).get("/protected")).resolves.toMatchObject({
      status: 200,
    });
    await expect(request(app).post("/protected")).resolves.toMatchObject({
      status: 200,
    });
  });

  it("allows the legacy broad role on scoped routes", async () => {
    const app = appWithRoles(["admin"]);

    await expect(request(app).get("/protected")).resolves.toMatchObject({
      status: 200,
    });
    await expect(request(app).post("/protected")).resolves.toMatchObject({
      status: 200,
    });
  });

  it("rejects read roles on write routes without naming any role", async () => {
    const res = await request(appWithRoles(["admin:read"])).post("/protected");

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "insufficient_role" });
  });

  it("rejects a user with no roles as lacking the role", async () => {
    const res = await request(appWithRoles(undefined)).get("/protected");

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "insufficient_role" });
  });

  it("rejects a request no guard authenticated", async () => {
    const app = express();
    app.get("/protected", requireRole("admin"), (_req, res) => res.json({}));

    const res = await request(app).get("/protected");

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "unauthenticated" });
  });
});
