import {
  MIN_SECRET_LENGTH,
  assertSecretStrength,
  assertSecrets,
  createServiceToken,
  ensureCookies,
  getSeamlessUser,
  refreshAccessToken,
} from "../dist/index.js";

const STRONG_COOKIE_SECRET = "cookie-secret-cookie-secret-cookie-secret";
const STRONG_SERVICE_SECRET = "service-secret-service-secret-service-secret";

describe("assertSecretStrength", () => {
  it("exposes a 32 character minimum", () => {
    expect(MIN_SECRET_LENGTH).toBe(32);
  });

  it("accepts a secret at the minimum length", () => {
    expect(() =>
      assertSecretStrength("cookieSecret", "a".repeat(MIN_SECRET_LENGTH)),
    ).not.toThrow();
  });

  it("rejects a secret one character below the minimum", () => {
    expect(() =>
      assertSecretStrength("cookieSecret", "a".repeat(MIN_SECRET_LENGTH - 1)),
    ).toThrow(/cookieSecret must be at least 32 characters/);
  });

  it("reports a missing secret separately from a weak one", () => {
    expect(() => assertSecretStrength("cookieSecret", undefined)).toThrow(
      /Missing cookieSecret/,
    );
    expect(() => assertSecretStrength("cookieSecret", "")).toThrow(
      /Missing cookieSecret/,
    );
    expect(() => assertSecretStrength("cookieSecret", 12345)).toThrow(
      /Missing cookieSecret/,
    );
  });

  it("names the option that failed", () => {
    expect(() => assertSecretStrength("serviceSecret", "short")).toThrow(
      /serviceSecret must be at least/,
    );
  });
});

describe("assertSecrets", () => {
  it("accepts a strong pair", () => {
    expect(() =>
      assertSecrets({
        cookieSecret: STRONG_COOKIE_SECRET,
        serviceSecret: STRONG_SERVICE_SECRET,
      }),
    ).not.toThrow();
  });

  it("throws on either weak secret", () => {
    expect(() =>
      assertSecrets({
        cookieSecret: "weak",
        serviceSecret: STRONG_SERVICE_SECRET,
      }),
    ).toThrow(/cookieSecret must be at least/);

    expect(() =>
      assertSecrets({
        cookieSecret: STRONG_COOKIE_SECRET,
        serviceSecret: "weak",
      }),
    ).toThrow(/serviceSecret must be at least/);
  });
});

describe("core entry points enforce secret strength", () => {
  it("createServiceToken throws on a weak serviceSecret", () => {
    expect(() =>
      createServiceToken({
        subject: "user-123",
        issuer: "seamless-portal-api",
        audience: "seamless-auth",
        serviceSecret: "weak",
        keyId: "test-main",
      }),
    ).toThrow(/serviceSecret must be at least/);
  });

  it("createServiceToken signs with a strong serviceSecret", () => {
    const token = createServiceToken({
      subject: "user-123",
      issuer: "seamless-portal-api",
      audience: "seamless-auth",
      serviceSecret: STRONG_SERVICE_SECRET,
      keyId: "test-main",
    });

    expect(typeof token).toBe("string");
  });

  it("getSeamlessUser rejects a weak cookieSecret", async () => {
    await expect(
      getSeamlessUser(
        { "seamless-access": "some-token" },
        {
          authServerUrl: "https://auth.example.com",
          cookieSecret: "weak",
          authorization: "Bearer token",
        },
      ),
    ).rejects.toThrow(/cookieSecret must be at least/);
  });

  it("refreshAccessToken rejects a weak cookieSecret", async () => {
    await expect(
      refreshAccessToken("refresh-cookie", {
        authServerUrl: "https://auth.example.com",
        cookieSecret: "weak",
        serviceSecret: STRONG_SERVICE_SECRET,
        issuer: "seamless-portal-api",
        audience: "seamless-auth",
        keyId: "test-main",
      }),
    ).rejects.toThrow(/cookieSecret must be at least/);
  });

  it("ensureCookies rejects a weak serviceSecret", async () => {
    await expect(
      ensureCookies(
        { path: "/users/me", cookies: {} },
        {
          authServerUrl: "https://auth.example.com",
          accessCookieName: "seamless-access",
          registrationCookieName: "seamless-ephemeral",
          refreshCookieName: "seamless-refresh",
          preAuthCookieName: "seamless-ephemeral",
          cookieSecret: STRONG_COOKIE_SECRET,
          serviceSecret: "weak",
          issuer: "seamless-portal-api",
          audience: "seamless-auth",
          keyId: "test-main",
        },
      ),
    ).rejects.toThrow(/serviceSecret must be at least/);
  });
});
