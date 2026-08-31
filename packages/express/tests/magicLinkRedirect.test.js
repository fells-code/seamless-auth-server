// Locks the path a magic link destination takes through the adapter: a browser
// posts it in the body, and the auth API expects it as a query parameter on a GET.
// The adapter forwards without judging it, because the API holds the allowlist.
import { jest } from "@jest/globals";
import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";

const { default: createSeamlessAuthServer } = await import("../dist/index.js");

const COOKIE_SECRET = "cookie-secret-cookie-secret-cookie-secret";

function createJsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function createPreAuthCookie() {
  const token = jwt.sign(
    { sub: "user-123", token: "ephemeral-token" },
    COOKIE_SECRET,
    { algorithm: "HS256", expiresIn: "300s" },
  );

  return `seamless-ephemeral=${token}`;
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

describe("magic link redirect target", () => {
  const originalFetch = global.fetch;
  let requestedUrl;

  beforeEach(() => {
    requestedUrl = undefined;
    global.fetch = jest.fn(async (url) => {
      requestedUrl = String(url);
      return createJsonResponse(200, { message: "sent" });
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  async function post(body) {
    const req = request(createApp())
      .post("/auth/magic-link")
      .set("Cookie", createPreAuthCookie());

    await (body === undefined ? req : req.send(body));

    return requestedUrl;
  }

  it("forwards a target from the request body as a query parameter", async () => {
    const url = await post({ redirectUri: "https://app.example.com/magic" });

    expect(new URL(url).searchParams.get("redirectUri")).toBe(
      "https://app.example.com/magic",
    );
  });

  it("asks for the tenant default when the body carries no target", async () => {
    expect(await post({})).toBe("https://auth.example.com/magic-link");
  });

  it("asks for the tenant default when there is no body at all", async () => {
    expect(await post()).toBe("https://auth.example.com/magic-link");
  });

  // Anything the API cannot validate as a URL should reach it and be refused there,
  // rather than being turned into a query parameter that means something else.
  it("ignores a target that is not a string", async () => {
    expect(await post({ redirectUri: { href: "https://evil.example" } })).toBe(
      "https://auth.example.com/magic-link",
    );
  });
});
