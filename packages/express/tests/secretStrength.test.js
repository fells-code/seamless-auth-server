import { jest } from "@jest/globals";

const {
  default: createSeamlessAuthServer,
  createEnsureCookiesMiddleware,
  requireAuth,
} = await import("../dist/index.js");

const STRONG_COOKIE_SECRET = "cookie-secret-cookie-secret-cookie-secret";
const STRONG_SERVICE_SECRET = "service-secret-service-secret-service-secret";

function serverOptions(overrides = {}) {
  return {
    authServerUrl: "https://auth.example.com",
    cookieSecret: STRONG_COOKIE_SECRET,
    serviceSecret: STRONG_SERVICE_SECRET,
    audience: "https://auth.example.com",
    jwksKid: "2024-09-main",
    ...overrides,
  };
}

function middlewareOptions(overrides = {}) {
  return {
    authServerUrl: "https://auth.example.com",
    accessCookieName: "seamless-access",
    registrationCookieName: "seamless-ephemeral",
    refreshCookieName: "seamless-refresh",
    preAuthCookieName: "seamless-ephemeral",
    cookieSecret: STRONG_COOKIE_SECRET,
    serviceSecret: STRONG_SERVICE_SECRET,
    issuer: "https://api.example.com",
    audience: "https://auth.example.com",
    keyId: "2024-09-main",
    ...overrides,
  };
}

describe("secret strength validation", () => {
  it("accepts secrets at or above the minimum length", () => {
    expect(() => createSeamlessAuthServer(serverOptions())).not.toThrow();
    expect(() =>
      createEnsureCookiesMiddleware(middlewareOptions()),
    ).not.toThrow();
  });

  it("throws on a too-short cookieSecret", () => {
    expect(() =>
      createSeamlessAuthServer(serverOptions({ cookieSecret: "short" })),
    ).toThrow(/cookieSecret must be at least 32 characters/);
  });

  it("throws on a too-short serviceSecret", () => {
    expect(() =>
      createSeamlessAuthServer(serverOptions({ serviceSecret: "short" })),
    ).toThrow(/serviceSecret must be at least 32 characters/);
  });

  it("rejects a secret one character below the minimum", () => {
    expect(() =>
      createSeamlessAuthServer(serverOptions({ cookieSecret: "a".repeat(31) })),
    ).toThrow(/at least 32 characters/);

    expect(() =>
      createSeamlessAuthServer(serverOptions({ cookieSecret: "a".repeat(32) })),
    ).not.toThrow();
  });

  it("still reports missing secrets", () => {
    expect(() =>
      createSeamlessAuthServer(serverOptions({ cookieSecret: undefined })),
    ).toThrow(/Missing cookieSecret/);

    expect(() =>
      createEnsureCookiesMiddleware(middlewareOptions({ serviceSecret: "" })),
    ).toThrow(/Missing serviceSecret/);
  });

  it("throws for a too-short secret passed to the ensureCookies middleware", () => {
    expect(() =>
      createEnsureCookiesMiddleware(middlewareOptions({ cookieSecret: "weak" })),
    ).toThrow(/cookieSecret must be at least 32 characters/);
  });
});

describe("requireAuth secret strength", () => {
  it("accepts a strong cookieSecret", () => {
    expect(() =>
      requireAuth({ cookieSecret: STRONG_COOKIE_SECRET }),
    ).not.toThrow();
  });

  it("throws on a too-short cookieSecret", () => {
    expect(() => requireAuth({ cookieSecret: "short" })).toThrow(
      /requireAuth: cookieSecret must be at least 32 characters/,
    );
  });

  it("still reports a missing cookieSecret", () => {
    expect(() => requireAuth({})).toThrow(
      /Missing requireAuth: cookieSecret/,
    );
  });
});

describe("jwksKid default", () => {
  let warnSpy;

  beforeEach(() => {
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("warns when jwksKid is omitted", () => {
    createSeamlessAuthServer(serverOptions({ jwksKid: undefined }));

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("jwksKid is not set"),
    );
  });

  it("warns when jwksKid is the dev default", () => {
    createSeamlessAuthServer(serverOptions({ jwksKid: "dev-main" }));

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("jwksKid is not set"),
    );
  });

  it("does not warn when jwksKid is set explicitly", () => {
    createSeamlessAuthServer(serverOptions({ jwksKid: "2024-09-main" }));

    expect(warnSpy).not.toHaveBeenCalled();
  });
});
