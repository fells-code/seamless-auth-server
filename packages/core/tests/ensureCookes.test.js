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
  cookieSecret: "cookie-secret",
  serviceSecret: "service-secret",
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
      token: "new-access",
      refreshToken: "new-refresh",
      roles: ["user"],
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

    expect(result.setCookies).toHaveLength(2);

    const [accessCookie, refreshCookie] = result.setCookies;
    expect(accessCookie.name).toBe("access");
    expect(refreshCookie.name).toBe("refresh");
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
});
