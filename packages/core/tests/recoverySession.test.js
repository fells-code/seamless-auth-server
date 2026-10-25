import { jest } from "@jest/globals";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import jwt from "jsonwebtoken";

const { authenticateCookie, authenticateRequest } = await import("../dist/guards.js");

const COOKIE_SECRET = "cookie-secret-cookie-secret-cookie-secret";
const SERVER = "https://recovery-guard.example.com";

const inner = (claims) =>
  jwt.sign({ sub: "user-1", typ: "access", ...claims }, "upstream-signing-key");
const cookie = (token) => jwt.sign({ sub: "user-1", token }, COOKIE_SECRET, { expiresIn: "300s" });

const { privateKey, publicKey } = await generateKeyPair("RS256");
const jwk = { ...(await exportJWK(publicKey)), alg: "RS256", kid: "k1", use: "sig" };

async function bearerToken(claims) {
  return new SignJWT({ sub: "user-1", typ: "access", sid: "s-1", ...claims })
    .setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setIssuer(SERVER)
    .setAudience(SERVER)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);
}

const originalFetch = global.fetch;

beforeEach(() => {
  global.fetch = jest.fn(async () =>
    new Response(JSON.stringify({ keys: [jwk] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
});

afterEach(() => {
  global.fetch = originalFetch;
});

// A recovery session can only enroll a new factor, so an app must not treat it as
// signed in unless the route asks for it.
describe("recovery sessions", () => {
  it("refuses a recovery cookie with enrollment_required", () => {
    const result = authenticateCookie({
      token: cookie(inner({ recovery: true })),
      cookieSecret: COOKIE_SECRET,
    });

    expect(result.user).toBeUndefined();
    expect(result.rejection).toEqual({ status: 403, errorCode: "enrollment_required" });
  });

  it("accepts a recovery cookie when the route allows it", () => {
    const { user } = authenticateCookie({
      token: cookie(inner({ recovery: true })),
      cookieSecret: COOKIE_SECRET,
      allowRecoverySession: true,
    });

    expect(user).toMatchObject({ id: "user-1" });
  });

  it("is unaffected by a session without the claim", () => {
    const { user } = authenticateCookie({
      token: cookie(inner({ recovery: false })),
      cookieSecret: COOKIE_SECRET,
    });

    expect(user).toMatchObject({ id: "user-1" });
  });

  it("refuses a recovery bearer token, and accepts it when allowed", async () => {
    const authorization = `Bearer ${await bearerToken({ recovery: true })}`;
    const bearer = { authServerUrl: SERVER, audience: SERVER };

    const refused = await authenticateRequest({
      cookieSecret: COOKIE_SECRET,
      authorization,
      bearer,
    });
    const allowed = await authenticateRequest({
      cookieSecret: COOKIE_SECRET,
      authorization,
      bearer,
      allowRecoverySession: true,
    });

    expect(refused.rejection).toEqual({ status: 403, errorCode: "enrollment_required" });
    expect(allowed.user).toMatchObject({ id: "user-1" });
  });
});
