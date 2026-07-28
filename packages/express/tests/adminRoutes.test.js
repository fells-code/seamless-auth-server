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

function createAccessCookie(subject = "admin-123") {
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

describe("admin routes", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("forwards the delete user body to the auth API", async () => {
    global.fetch.mockResolvedValue(
      createJsonResponse(200, { message: "Success" }),
    );

    const body = { userId: "user-1" };

    const res = await request(createApp())
      .delete("/auth/admin/users")
      .set("Cookie", createAccessCookie())
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: "Success" });
    expect(global.fetch).toHaveBeenCalledWith(
      "https://auth.example.com/admin/users",
      expect.objectContaining({
        method: "DELETE",
        body: JSON.stringify(body),
        headers: expect.objectContaining({
          Authorization: "Bearer access-token",
          "x-seamless-service-token": expect.not.stringContaining("access-token"),
        }),
      }),
    );
  });

  it("returns the upstream validation detail on a rejected user update (#115)", async () => {
    const zodBody = {
      name: "ZodError",
      message:
        '[{"code":"invalid_type","path":["phone"],"message":"Expected string, received null"}]',
    };

    global.fetch.mockResolvedValue(createJsonResponse(400, zodBody));

    const res = await request(createApp())
      .patch("/auth/admin/users/user-1")
      .set("Cookie", createAccessCookie())
      .send({ phone: "" });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: zodBody.message, details: zodBody });
  });
});
