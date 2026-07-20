import { jest } from "@jest/globals";
import jwt from "jsonwebtoken";

const { getSeamlessUser } = await import("../dist/index.js");

const SERVICE_SECRET = "service-secret-service-secret-service-secret";
const COOKIE_SECRET = "cookie-secret-cookie-secret-cookie-secret";
const USER_ACCESS_TOKEN = "user-access-token";
const USER = {
  id: "user-1",
  email: "user@example.com",
  phone: null,
  roles: ["user"],
};

function createAccessCookie() {
  return jwt.sign(
    { sub: "user-1", sessionId: "session-1", token: USER_ACCESS_TOKEN },
    COOKIE_SECRET,
    { algorithm: "HS256", expiresIn: "300s" },
  );
}

function createRequest(overrides = {}) {
  return {
    cookies: { "seamless-access": createAccessCookie() },
    user: { token: USER_ACCESS_TOKEN },
    ip: "203.0.113.44",
    app: { get: () => 1 },
    ...overrides,
  };
}

function baseOptions(overrides = {}) {
  return {
    authServerUrl: "https://auth.example.com",
    cookieSecret: COOKIE_SECRET,
    serviceSecret: SERVICE_SECRET,
    audience: "https://auth.example.com",
    jwksKid: "test-main",
    ...overrides,
  };
}

function lastHeaders() {
  return global.fetch.mock.calls[0][1].headers;
}

describe("getSeamlessUser (express)", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ user: USER }),
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("sends a service token the auth API will accept", async () => {
    await getSeamlessUser(createRequest(), baseOptions());

    const header = lastHeaders()["x-seamless-service-token"];
    expect(header).toMatch(/^Bearer /);

    const raw = header.slice("Bearer ".length);
    expect(jwt.decode(raw, { complete: true }).header.alg).toBe("HS256");

    const decoded = jwt.verify(raw, SERVICE_SECRET, { algorithms: ["HS256"] });
    expect(decoded.iss).toBe("seamless-portal-api");
    expect(decoded.aud).toBe("seamless-auth");
    expect(decoded.sub).toBe("seamless-auth-express-adapter");
  });

  it("forwards the client IP together with the service token", async () => {
    await getSeamlessUser(createRequest(), baseOptions());

    const headers = lastHeaders();

    // The API's trustedClientIp middleware ignores the IP unless a service token
    // accompanies it, so asserting the pair is the point of this test.
    expect(headers["x-seamless-client-ip"]).toBe("203.0.113.44");
    expect(headers["x-seamless-service-token"]).toMatch(/^Bearer /);
  });

  it("keeps the user access token in Authorization only", async () => {
    await getSeamlessUser(createRequest(), baseOptions());

    const headers = lastHeaders();
    expect(headers.Authorization).toBe(`Bearer ${USER_ACCESS_TOKEN}`);
    expect(headers["x-seamless-service-token"]).not.toContain(
      USER_ACCESS_TOKEN,
    );
  });

  it("returns the user from the auth server", async () => {
    const user = await getSeamlessUser(createRequest(), baseOptions());

    expect(user).toEqual(USER);
    expect(global.fetch).toHaveBeenCalledWith(
      "https://auth.example.com/users/me",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("honors a custom access cookie name", async () => {
    const req = createRequest({
      cookies: { "custom-access": createAccessCookie() },
    });

    const user = await getSeamlessUser(
      req,
      baseOptions({ accessCookieName: "custom-access" }),
    );

    expect(user).toEqual(USER);
  });

  it("drops the client IP when trust proxy is blanket true", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const req = createRequest({ app: { get: () => true } });

    await getSeamlessUser(req, baseOptions());

    expect(lastHeaders()).not.toHaveProperty("x-seamless-client-ip");
    warn.mockRestore();
  });

  it("uses a caller supplied resolver when one is configured", async () => {
    await getSeamlessUser(
      createRequest(),
      baseOptions({ resolveClientIp: () => "198.51.100.7" }),
    );

    expect(lastHeaders()["x-seamless-client-ip"]).toBe("198.51.100.7");
  });

  it("omits the service token when no serviceSecret is configured", async () => {
    const opts = baseOptions();
    delete opts.serviceSecret;

    await getSeamlessUser(createRequest(), opts);

    expect(lastHeaders()).not.toHaveProperty("x-seamless-service-token");
  });
});
