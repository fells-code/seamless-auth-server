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

describe("cookie requirement routes", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("forwards a Bearer token when updating a user (#57)", async () => {
    global.fetch.mockResolvedValue(
      createJsonResponse(200, { message: "Success" }),
    );

    const body = { email: "user@example.com" };

    const res = await request(createApp())
      .post("/auth/users/update")
      .set("Cookie", createAccessCookie())
      .send(body);

    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledWith(
      "https://auth.example.com/users/update",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(body),
        headers: expect.objectContaining({
          Authorization: "Bearer access-token",
        }),
      }),
    );
  });

  it("forwards a Bearer token when adding a credential (#57)", async () => {
    global.fetch.mockResolvedValue(
      createJsonResponse(200, { message: "Success" }),
    );

    const res = await request(createApp())
      .post("/auth/users/credentials")
      .set("Cookie", createAccessCookie())
      .send({ credentialId: "cred-1" });

    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledWith(
      "https://auth.example.com/users/credentials",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer access-token",
        }),
      }),
    );
  });

  it("forwards a Bearer token when deleting a credential (#57)", async () => {
    global.fetch.mockResolvedValue(
      createJsonResponse(200, { message: "Success" }),
    );

    const res = await request(createApp())
      .delete("/auth/users/credentials")
      .set("Cookie", createAccessCookie())
      .send({ credentialId: "cred-1" });

    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledWith(
      "https://auth.example.com/users/credentials",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer access-token",
        }),
      }),
    );
  });

  it("rejects user update without an access session (#57)", async () => {
    const res = await request(createApp()).post("/auth/users/update").send({});

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("forwards a Bearer token when listing sessions (#58)", async () => {
    global.fetch.mockResolvedValue(createJsonResponse(200, { sessions: [] }));

    const res = await request(createApp())
      .get("/auth/sessions")
      .set("Cookie", createAccessCookie());

    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("https://auth.example.com/sessions"),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer access-token",
        }),
      }),
    );
  });

  it("forwards a Bearer token for the admin credential count (#58)", async () => {
    global.fetch.mockResolvedValue(createJsonResponse(200, { count: 3 }));

    const res = await request(createApp())
      .get("/auth/admin/credential-count")
      .set("Cookie", createAccessCookie());

    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("https://auth.example.com/admin/credential-count"),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer access-token",
        }),
      }),
    );
  });

  it("verifies a magic link without cookies for cross-device opens (#60)", async () => {
    global.fetch.mockResolvedValue(
      createJsonResponse(200, { message: "Verified" }),
    );

    const res = await request(createApp()).get(
      "/auth/magic-link/verify/token-abc",
    );

    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledWith(
      "https://auth.example.com/magic-link/verify/token-abc",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("keeps an injected magic link token in a single path segment (#65)", async () => {
    global.fetch.mockResolvedValue(
      createJsonResponse(200, { message: "Verified" }),
    );

    await request(createApp()).get(
      "/auth/magic-link/verify/" +
        encodeURIComponent("../admin/users?admin=true"),
    );

    expect(global.fetch).toHaveBeenCalledWith(
      "https://auth.example.com/magic-link/verify/..%2Fadmin%2Fusers%3Fadmin%3Dtrue",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("does not shadow the /admin/sessions route with /sessions", async () => {
    global.fetch.mockResolvedValue(createJsonResponse(200, { sessions: [] }));

    const res = await request(createApp())
      .get("/auth/admin/sessions")
      .set("Cookie", createAccessCookie());

    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("https://auth.example.com/admin/sessions"),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer access-token",
        }),
      }),
    );
  });
});
