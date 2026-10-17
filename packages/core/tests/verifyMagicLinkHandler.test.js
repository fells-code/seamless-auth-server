import { jest } from "@jest/globals";
import jwt from "jsonwebtoken";

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("verifyMagicLinkHandler", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(jsonResponse(200, { message: "verified" }));
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("encodes the token into a single upstream path segment", async () => {
    const { verifyMagicLinkHandler } = await import(
      "../dist/handlers/verifyMagicLinkHandler.js"
    );

    await verifyMagicLinkHandler(
      { token: "abc123" },
      { authServerUrl: "https://auth.example.com" },
    );

    expect(global.fetch).toHaveBeenCalledWith(
      "https://auth.example.com/magic-link/verify/abc123",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("keeps a traversal-shaped token confined to one path segment", async () => {
    const { verifyMagicLinkHandler } = await import(
      "../dist/handlers/verifyMagicLinkHandler.js"
    );

    await verifyMagicLinkHandler(
      { token: "../../admin/users" },
      { authServerUrl: "https://auth.example.com" },
    );

    expect(global.fetch).toHaveBeenCalledWith(
      "https://auth.example.com/magic-link/verify/..%2F..%2Fadmin%2Fusers",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("keeps a query-injecting token confined to one path segment", async () => {
    const { verifyMagicLinkHandler } = await import(
      "../dist/handlers/verifyMagicLinkHandler.js"
    );

    await verifyMagicLinkHandler(
      { token: "x?admin=1" },
      { authServerUrl: "https://auth.example.com" },
    );

    expect(global.fetch).toHaveBeenCalledWith(
      "https://auth.example.com/magic-link/verify/x%3Fadmin%3D1",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("forwards the opener's credential with the service identity", async () => {
    const { verifyMagicLinkHandler } = await import(
      "../dist/handlers/verifyMagicLinkHandler.js"
    );

    await verifyMagicLinkHandler(
      { token: "abc123", authorization: "Bearer ephemeral" },
      {
        authServerUrl: "https://auth.example.com",
        serviceAuthorization: "Bearer service",
        forwardedClientIp: "203.0.113.7",
        forwardedUserAgent: "Mozilla/5.0",
      },
    );

    const [, init] = global.fetch.mock.calls[0];
    expect(init.headers).toMatchObject({
      Authorization: "Bearer ephemeral",
      "x-seamless-service-token": "Bearer service",
      "x-seamless-client-ip": "203.0.113.7",
      "x-seamless-client-user-agent": "Mozilla/5.0",
    });
  });

  it("sends no Authorization when the opener has no credential", async () => {
    const { verifyMagicLinkHandler } = await import(
      "../dist/handlers/verifyMagicLinkHandler.js"
    );

    await verifyMagicLinkHandler(
      { token: "abc123" },
      { authServerUrl: "https://auth.example.com" },
    );

    const [, init] = global.fetch.mock.calls[0];
    expect(init.headers.Authorization).toBeUndefined();
  });

  it("passes a confirmation request through verbatim", async () => {
    const body = {
      error: "confirmation_required",
      message: "Confirm this sign-in.",
      requestedFrom: { deviceClass: "ios", requestedAt: "2026-10-16T12:00:00.000Z" },
    };
    global.fetch.mockResolvedValue(jsonResponse(409, body));

    const { verifyMagicLinkHandler } = await import(
      "../dist/handlers/verifyMagicLinkHandler.js"
    );

    await expect(
      verifyMagicLinkHandler(
        { token: "abc123" },
        { authServerUrl: "https://auth.example.com" },
      ),
    ).resolves.toEqual({ status: 409, errorBody: body });
  });
});

describe("magicLinkVerifyAuthorization", () => {
  const cookieSecret = "cookie-secret-cookie-secret-cookie-secret";

  async function load() {
    return (await import("../dist/handlers/verifyMagicLinkHandler.js"))
      .magicLinkVerifyAuthorization;
  }

  it("reads the token out of a valid pre-auth cookie", async () => {
    const magicLinkVerifyAuthorization = await load();
    const preAuthCookie = jwt.sign({ sub: "u1", token: "ephemeral" }, cookieSecret, {
      algorithm: "HS256",
    });

    expect(magicLinkVerifyAuthorization({ preAuthCookie, cookieSecret })).toBe(
      "Bearer ephemeral",
    );
  });

  it.each([
    ["no cookie", undefined],
    ["a cookie signed with another secret", jwt.sign({ sub: "u1", token: "x" }, "another-secret-another-secret-another", { algorithm: "HS256" })],
    ["an expired cookie", jwt.sign({ sub: "u1", token: "x", exp: 1 }, cookieSecret, { algorithm: "HS256" })],
    ["a cookie without a token", jwt.sign({ sub: "u1" }, cookieSecret, { algorithm: "HS256" })],
    ["a value that is not a JWT", "garbage"],
  ])("yields nothing for %s", async (_label, preAuthCookie) => {
    const magicLinkVerifyAuthorization = await load();

    expect(magicLinkVerifyAuthorization({ preAuthCookie, cookieSecret })).toBeUndefined();
  });

  it("forwards the client's bearer token in bearer transport", async () => {
    const magicLinkVerifyAuthorization = await load();

    expect(
      magicLinkVerifyAuthorization({
        transport: "bearer",
        authorizationHeader: "Bearer ephemeral",
        cookieSecret,
      }),
    ).toBe("Bearer ephemeral");
    expect(
      magicLinkVerifyAuthorization({ transport: "bearer", cookieSecret }),
    ).toBeUndefined();
  });

  it("ignores a cookie in bearer transport", async () => {
    const magicLinkVerifyAuthorization = await load();
    const preAuthCookie = jwt.sign({ sub: "u1", token: "ephemeral" }, cookieSecret, {
      algorithm: "HS256",
    });

    expect(
      magicLinkVerifyAuthorization({ transport: "bearer", preAuthCookie, cookieSecret }),
    ).toBeUndefined();
  });
});
