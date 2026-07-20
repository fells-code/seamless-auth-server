import { jest } from "@jest/globals";
import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";

const { default: createSeamlessAuthServer } = await import("../dist/index.js");

function createJsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function createAccessCookie(subject = "user-123") {
  const token = jwt.sign(
    {
      sub: subject,
      roles: ["admin"],
      sessionId: "session-123",
      token: "access-token",
    },
    "cookie-secret-cookie-secret-cookie-secret",
    {
      algorithm: "HS256",
      expiresIn: "300s",
    },
  );

  return `seamless-access=${token}`;
}

function createApp() {
  const app = express();

  app.use(
    "/auth",
    createSeamlessAuthServer({
      authServerUrl: "https://auth.example.com",
      cookieSecret: "cookie-secret-cookie-secret-cookie-secret",
      serviceSecret: "service-secret-service-secret-service-secret",
      audience: "https://auth.example.com",
      jwksKid: "test-main",
    }),
  );

  return app;
}

describe("organization proxy routes", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("proxies organization listing with access identity", async () => {
    global.fetch.mockResolvedValue(
      createJsonResponse(200, {
        organizations: [{ id: "org-1", name: "Acme", slug: "acme" }],
        total: 1,
      }),
    );

    const res = await request(createApp())
      .get("/auth/admin/organizations")
      .set("Cookie", createAccessCookie());

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      organizations: [{ id: "org-1", name: "Acme", slug: "acme" }],
      total: 1,
    });
    expect(global.fetch).toHaveBeenCalledWith(
      "https://auth.example.com/admin/organizations",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer access-token",
          "x-seamless-service-token": expect.not.stringContaining("access-token"),
        }),
      }),
    );
  });

  it("proxies organization member writes with path params and body", async () => {
    global.fetch.mockResolvedValue(
      createJsonResponse(200, {
        membership: {
          id: "membership-1",
          userId: "user-2",
          organizationId: "org-1",
          roles: ["admin"],
          scopes: ["members:write"],
        },
      }),
    );

    const body = { roles: ["admin"], scopes: ["members:write"] };

    const res = await request(createApp())
      .patch("/auth/admin/organizations/org-1/members/user-2")
      .set("Cookie", createAccessCookie())
      .send(body);

    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledWith(
      "https://auth.example.com/admin/organizations/org-1/members/user-2",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    );
  });
});
