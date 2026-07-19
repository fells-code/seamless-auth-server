import { jest } from "@jest/globals";

const verifyCookieJwtMock = jest.fn();
const refreshAccessTokenMock = jest.fn();

jest.unstable_mockModule("../dist/verifyCookieJwt.js", () => ({
  verifyCookieJwt: verifyCookieJwtMock,
}));

jest.unstable_mockModule("../dist/refreshAccessToken.js", () => ({
  refreshAccessToken: refreshAccessTokenMock,
}));

const BASE_OPTS = {
  authServerUrl: "https://auth.example.com",
  cookieDomain: "example.com",
  accessCookieName: "access",
  registrationCookieName: "registration",
  refreshCookieName: "refresh",
  preAuthCookieName: "preauth",
  cookieSecret: "cookie-secret-cookie-secret-cookie-secret",
  serviceSecret: "service-secret-service-secret-service-secret",
  issuer: "https://frontend.example.com",
  audience: "https://auth.example.com",
  keyId: "dev-main",
};

describe("ensureCookies", () => {
  beforeEach(() => {
    verifyCookieJwtMock.mockReset();
    refreshAccessTokenMock.mockReset();
  });

  it("returns ok when route does not require cookies", async () => {
    const { ensureCookies } = await import("../dist/ensureCookies.js");

    const result = await ensureCookies(
      { path: "/health", cookies: {} },
      BASE_OPTS,
    );

    expect(result).toEqual({ type: "ok" });
  });

  it("returns ok and user when required cookie exists and is valid", async () => {
    const { ensureCookies } = await import("../dist/ensureCookies.js");

    verifyCookieJwtMock.mockReturnValue({
      sub: "user-123",
      token: "access-token",
      roles: ["user"],
    });

    const result = await ensureCookies(
      {
        path: "/users/me",
        cookies: { access: "valid.jwt.token" },
      },
      BASE_OPTS,
    );

    expect(result.type).toBe("ok");
    expect(result.user).toEqual({
      sub: "user-123",
      token: "access-token",
      roles: ["user"],
    });
  });

  it("returns error when required cookie missing and no refresh cookie", async () => {
    const { ensureCookies } = await import("../dist/ensureCookies.js");

    const result = await ensureCookies(
      {
        path: "/users/me",
        cookies: {},
      },
      BASE_OPTS,
    );

    expect(result.type).toBe("error");
    expect(result.status).toBe(400);
  });

  it("refreshes session when required cookie missing but refresh cookie exists", async () => {
    const { ensureCookies } = await import("../dist/ensureCookies.js");

    refreshAccessTokenMock.mockResolvedValue({
      sub: "user-123",
      sessionId: "session-123",
      token: "new-access",
      refreshToken: "new-refresh",
      roles: ["user"],
      email: "test@example.com",
      phone: "+14155552671",
      organizationId: "org-123",
      ttl: 300,
      refreshTtl: 3600,
    });

    const result = await ensureCookies(
      {
        path: "/users/me",
        cookies: { refresh: "refresh.jwt" },
      },
      BASE_OPTS,
    );

    expect(result.type).toBe("ok");
    expect(result.user?.sub).toBe("user-123");
    expect(result.user?.sessionId).toBe("session-123");
    expect(result.user?.token).toBe("new-access");

    expect(result.setCookies).toHaveLength(2);

    const [accessCookie, refreshCookie] = result.setCookies;
    expect(accessCookie.name).toBe("access");
    expect(accessCookie.value).toEqual({
      sub: "user-123",
      sessionId: "session-123",
      token: "new-access",
      roles: ["user"],
      email: "test@example.com",
      phone: "+14155552671",
      organizationId: "org-123",
    });
    expect(refreshCookie.name).toBe("refresh");
  });

  it("refreshes old access cookies that do not contain a stored auth token", async () => {
    const { ensureCookies } = await import("../dist/ensureCookies.js");

    verifyCookieJwtMock.mockReturnValue({
      sub: "user-123",
      sessionId: "session-123",
      roles: ["user"],
    });
    refreshAccessTokenMock.mockResolvedValue({
      sub: "user-123",
      sessionId: "session-456",
      token: "new-access",
      refreshToken: "new-refresh",
      roles: ["user"],
      email: "test@example.com",
      phone: "+14155552671",
      organizationId: null,
      ttl: 300,
      refreshTtl: 3600,
    });

    const result = await ensureCookies(
      {
        path: "/internal/auth-events/summary",
        cookies: { access: "old.access.jwt", refresh: "refresh.jwt" },
      },
      BASE_OPTS,
    );

    expect(result.type).toBe("ok");
    expect(result.user).toEqual({
      sub: "user-123",
      sessionId: "session-456",
      token: "new-access",
      roles: ["user"],
    });
  });

  it("returns error and clears cookies when refresh fails", async () => {
    const { ensureCookies } = await import("../dist/ensureCookies.js");

    refreshAccessTokenMock.mockResolvedValue(null);

    const result = await ensureCookies(
      {
        path: "/users/me",
        cookies: { refresh: "bad.refresh.jwt" },
      },
      BASE_OPTS,
    );

    expect(result.type).toBe("error");
    expect(result.status).toBe(401);
    expect(result.clearCookies).toEqual(["access", "registration", "refresh"]);
  });

  it("returns error when cookie exists but JWT is invalid", async () => {
    const { ensureCookies } = await import("../dist/ensureCookies.js");

    verifyCookieJwtMock.mockReturnValue(null);

    const result = await ensureCookies(
      {
        path: "/users/me",
        cookies: { access: "invalid.jwt" },
      },
      BASE_OPTS,
    );

    expect(result.type).toBe("error");
    expect(result.status).toBe(401);
  });

  it("requires the pre-auth cookie for magic-link continuation routes", async () => {
    const { ensureCookies } = await import("../dist/ensureCookies.js");

    verifyCookieJwtMock.mockReturnValue({
      sub: "user-123",
      token: "ephemeral-token",
      roles: ["user"],
    });

    const result = await ensureCookies(
      {
        path: "/magic-link",
        cookies: { preauth: "valid.preauth.jwt" },
      },
      BASE_OPTS,
    );

    expect(result.type).toBe("ok");
    expect(result.user).toEqual({
      sub: "user-123",
      token: "ephemeral-token",
      roles: ["user"],
    });
  });

  it("does not gate magic-link verify when no cookies are present (#60)", async () => {
    const { ensureCookies } = await import("../dist/ensureCookies.js");

    const result = await ensureCookies(
      {
        path: "/magic-link/verify/token-abc",
        cookies: {},
      },
      BASE_OPTS,
    );

    expect(result).toEqual({ type: "ok" });
    expect(verifyCookieJwtMock).not.toHaveBeenCalled();
    expect(refreshAccessTokenMock).not.toHaveBeenCalled();
  });

  it("does not gate magic-link verify even with a stale pre-auth cookie (#60)", async () => {
    const { ensureCookies } = await import("../dist/ensureCookies.js");

    verifyCookieJwtMock.mockReturnValue(null);

    const result = await ensureCookies(
      {
        path: "/magic-link/verify/token-abc",
        cookies: { preauth: "stale.preauth.jwt" },
      },
      BASE_OPTS,
    );

    expect(result).toEqual({ type: "ok" });
    expect(verifyCookieJwtMock).not.toHaveBeenCalled();
  });

  it("requires the pre-auth cookie for login OTP routes", async () => {
    const { ensureCookies } = await import("../dist/ensureCookies.js");

    verifyCookieJwtMock.mockReturnValue({
      sub: "user-123",
      token: "ephemeral-token",
      roles: ["user"],
    });

    const result = await ensureCookies(
      {
        path: "/otp/generate-login-email-otp",
        cookies: { preauth: "valid.preauth.jwt" },
      },
      BASE_OPTS,
    );

    expect(result.type).toBe("ok");
    expect(result.user).toEqual({
      sub: "user-123",
      token: "ephemeral-token",
      roles: ["user"],
    });
  });

  it("requires the access cookie for step-up routes", async () => {
    const { ensureCookies } = await import("../dist/ensureCookies.js");

    verifyCookieJwtMock.mockReturnValue({
      sub: "user-123",
      token: "access-token",
      sessionId: "session-123",
      roles: ["user"],
    });

    const result = await ensureCookies(
      {
        path: "/step-up/webauthn/start",
        cookies: { access: "valid.access.jwt" },
      },
      BASE_OPTS,
    );

    expect(result.type).toBe("ok");
    expect(result.user).toEqual({
      sub: "user-123",
      sessionId: "session-123",
      token: "access-token",
      roles: ["user"],
    });
  });

  it("requires the access cookie for auth event summary metrics", async () => {
    const { ensureCookies } = await import("../dist/ensureCookies.js");

    verifyCookieJwtMock.mockReturnValue({
      sub: "admin-123",
      token: "access-token",
      sessionId: "session-123",
      roles: ["admin"],
    });

    const result = await ensureCookies(
      {
        path: "/internal/auth-events/summary",
        cookies: { access: "valid.access.jwt" },
      },
      BASE_OPTS,
    );

    expect(result.type).toBe("ok");
    expect(result.user).toEqual({
      sub: "admin-123",
      sessionId: "session-123",
      token: "access-token",
      roles: ["admin"],
    });
  });

  it("requires the access cookie for TOTP routes", async () => {
    const { ensureCookies } = await import("../dist/ensureCookies.js");

    verifyCookieJwtMock.mockReturnValue({
      sub: "user-123",
      token: "access-token",
      sessionId: "session-123",
      roles: ["user"],
    });

    for (const path of [
      "/totp/status",
      "/totp/enroll/start",
      "/totp/enroll/verify",
      "/totp/disable",
      "/totp/verify-mfa",
    ]) {
      const result = await ensureCookies(
        { path, cookies: { access: "valid.access.jwt" } },
        BASE_OPTS,
      );

      expect(result.type).toBe("ok");
      expect(result.user?.token).toBe("access-token");
    }
  });

  it("matches cookie requirements case-insensitively", async () => {
    const { ensureCookies } = await import("../dist/ensureCookies.js");

    verifyCookieJwtMock.mockReturnValue({
      sub: "user-123",
      token: "ephemeral-token",
      roles: ["user"],
    });

    // A client may send "/webauthn/..." even though the requirement is keyed
    // "/webAuthn/..."; the pre-auth cookie requirement must still apply.
    const result = await ensureCookies(
      {
        path: "/webauthn/login/finish",
        cookies: { preauth: "valid.preauth.jwt" },
      },
      BASE_OPTS,
    );

    expect(result.type).toBe("ok");
    expect(result.user?.token).toBe("ephemeral-token");
  });

  it("requires the access cookie for organization routes", async () => {
    const { ensureCookies } = await import("../dist/ensureCookies.js");

    verifyCookieJwtMock.mockReturnValue({
      sub: "user-123",
      token: "access-token",
      sessionId: "session-123",
      roles: ["user"],
    });

    const result = await ensureCookies(
      {
        path: "/organizations/org-123/members",
        cookies: { access: "valid.access.jwt" },
      },
      BASE_OPTS,
    );

    expect(result.type).toBe("ok");
    expect(result.user).toEqual({
      sub: "user-123",
      sessionId: "session-123",
      token: "access-token",
      roles: ["user"],
    });
  });
});
