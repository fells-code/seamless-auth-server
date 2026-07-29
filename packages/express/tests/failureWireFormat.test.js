// Locks the JSON body the adapter emits for a failure. Core reports failures two
// ways and they render differently: `errorCode` becomes `{ error, details }`,
// while `errorBody` is the auth API's own body and goes out untouched. Callers
// read fields off that body directly, so reshaping it breaks them silently. The
// React SDK reads a top-level `error` or `message` for the message it shows, and
// a top-level `code` to tell OAuth failures apart.
import { jest } from "@jest/globals";
import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";

const { default: createSeamlessAuthServer } = await import("../dist/index.js");

const COOKIE_SECRET = "cookie-secret-cookie-secret-cookie-secret";

function createJsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function createAccessCookie() {
  const token = jwt.sign(
    {
      sub: "admin-123",
      roles: ["admin"],
      sessionId: "session-123",
      token: "access-token",
    },
    COOKIE_SECRET,
    { algorithm: "HS256", expiresIn: "300s" },
  );

  return `seamless-access=${token}`;
}

function createApp() {
  const app = express();

  app.use(
    "/auth",
    createSeamlessAuthServer({
      authServerUrl: "https://auth.example.com",
      cookieSecret: COOKIE_SECRET,
      serviceSecret: "service-secret-service-secret-service-secret",
      audience: "https://auth.example.com",
      jwksKid: "test-main",
    }),
  );

  return app;
}

const OAUTH_FAILURE = {
  error: "oauth_profile_error",
  message: "Email not verified",
  code: "oauth_email_not_verified",
};

const ZOD_FAILURE = {
  name: "ZodError",
  message: '[{"path":["phone"],"message":"Expected string"}]',
};

describe("failure wire format", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe("a passthrough route forwards the upstream body unchanged", () => {
    it.each([
      ["a plain code", { error: "account_locked" }],
      [
        "a code with a sibling field",
        { error: "step_up_required", stepUpToken: "abc" },
      ],
      ["an OAuth code the SDK reads", OAUTH_FAILURE],
      ["a validation body with no error key", ZOD_FAILURE],
      [
        "a rate-limit body with only a message",
        { message: "Too many requests." },
      ],
    ])("%s", async (_label, upstream) => {
      global.fetch.mockResolvedValue(createJsonResponse(400, upstream));

      const res = await request(createApp())
        .post("/auth/login")
        .send({ identifier: "someone@example.com" });

      expect(res.status).toBe(400);
      expect(res.body).toEqual(upstream);
    });
  });

  describe("a proxy route normalizes to a code", () => {
    async function patchUser(upstream) {
      global.fetch.mockResolvedValue(createJsonResponse(400, upstream));

      return request(createApp())
        .patch("/auth/admin/users/user-1")
        .set("Cookie", createAccessCookie())
        .send({ phone: "" });
    }

    it("passes a bare code through without a details key", async () => {
      const res = await patchUser({ error: "account_locked" });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "account_locked" });
    });

    it("keeps the whole upstream body under details when it carries more (#115)", async () => {
      const res = await patchUser(ZOD_FAILURE);

      expect(res.body).toEqual({
        error: ZOD_FAILURE.message,
        details: ZOD_FAILURE,
      });
    });

    it("falls back to the constant code for an empty body", async () => {
      const res = await patchUser(undefined);

      expect(res.body).toEqual({ error: "admin_request_failed" });
    });
  });

  // The two readers in seamless-auth-react that a reshaped body would break.
  describe("stays readable by the SDK", () => {
    function extractMessage(body) {
      if (typeof body !== "object" || body === null) return undefined;
      const { error, message } = body;
      if (typeof error === "string" && error) return error;
      return typeof message === "string" && message ? message : undefined;
    }

    it("keeps a message extractable on both route kinds", async () => {
      global.fetch.mockResolvedValue(createJsonResponse(400, ZOD_FAILURE));
      const passthrough = await request(createApp())
        .post("/auth/login")
        .send({ identifier: "someone@example.com" });

      global.fetch.mockResolvedValue(createJsonResponse(400, ZOD_FAILURE));
      const proxied = await request(createApp())
        .patch("/auth/admin/users/user-1")
        .set("Cookie", createAccessCookie())
        .send({ phone: "" });

      expect(extractMessage(passthrough.body)).toBe(ZOD_FAILURE.message);
      expect(extractMessage(proxied.body)).toBe(ZOD_FAILURE.message);
    });

    it("keeps the OAuth code at the top level, where getOAuthErrorCode reads it", async () => {
      global.fetch.mockResolvedValue(createJsonResponse(400, OAUTH_FAILURE));

      const res = await request(createApp())
        .post("/auth/login")
        .send({ identifier: "someone@example.com" });

      expect(res.body.code).toBe("oauth_email_not_verified");
    });
  });
});
