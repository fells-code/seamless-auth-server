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
      fetchManifest: false,
      authServerUrl: "https://auth.example.com",
      cookieSecret: "cookie-secret-cookie-secret-cookie-secret",
      serviceSecret: "service-secret-service-secret-service-secret",
      audience: "https://auth.example.com",
      jwksKid: "test-main",
    }),
  );

  return app;
}

describe("users proxy routes", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("proxies credential updates as POST with body", async () => {
    global.fetch.mockResolvedValue(
      createJsonResponse(200, { credential: { id: "cred-1", name: "Laptop" } }),
    );

    const body = { credentialId: "cred-1", name: "Laptop" };

    const res = await request(createApp())
      .post("/auth/users/credentials")
      .set("Cookie", createAccessCookie())
      .send(body);

    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledWith(
      "https://auth.example.com/users/credentials",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(body),
      }),
    );
  });

  it("proxies credential deletion as DELETE with body", async () => {
    global.fetch.mockResolvedValue(
      createJsonResponse(200, { message: "Credential deleted" }),
    );

    const body = { credentialId: "cred-1" };

    const res = await request(createApp())
      .delete("/auth/users/credentials")
      .set("Cookie", createAccessCookie())
      .send(body);

    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledWith(
      "https://auth.example.com/users/credentials",
      expect.objectContaining({
        method: "DELETE",
        body: JSON.stringify(body),
      }),
    );
  });

  // The SDK's deleteUser() sends this; it answered the adapter's own 404 until
  // the route existed (#166). Deleting the account ends the session the way
  // logout does, so the cookies that named it are cleared with the answer.
  it("deletes the account as DELETE /users/delete and clears every session cookie", async () => {
    global.fetch.mockResolvedValue(
      createJsonResponse(200, { message: "User deleted" }),
    );

    const res = await request(createApp())
      .delete("/auth/users/delete")
      .set("Cookie", createAccessCookie());

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: "User deleted" });
    expect(global.fetch).toHaveBeenCalledWith(
      "https://auth.example.com/users/delete",
      expect.objectContaining({
        method: "DELETE",
        headers: expect.objectContaining({
          Authorization: "Bearer access-token",
        }),
      }),
    );

    const cleared = res.headers["set-cookie"].map((c) => c.split(";")[0]);
    expect(cleared).toEqual(
      expect.arrayContaining([
        "seamless-access=",
        "seamless-ephemeral=",
        "seamless-refresh=",
      ]),
    );
  });

  it("keeps the cookies when the auth API refuses the deletion", async () => {
    global.fetch.mockResolvedValue(
      createJsonResponse(404, { error: "User not found." }),
    );

    const res = await request(createApp())
      .delete("/auth/users/delete")
      .set("Cookie", createAccessCookie());

    expect(res.status).toBe(404);
    expect(res.body).toEqual(
      expect.objectContaining({ error: "User not found." }),
    );
    expect(res.headers["set-cookie"] ?? []).toEqual([]);
  });

  it("does not reach the auth API for a deletion without a session", async () => {
    const res = await request(createApp()).delete("/auth/users/delete");

    expect([400, 401]).toContain(res.status);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
