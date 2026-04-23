import { jest } from "@jest/globals";

const verifyRefreshCookieMock = jest.fn();
const createServiceTokenMock = jest.fn();
const authFetchMock = jest.fn();

jest.unstable_mockModule("../dist/verifyRefreshCookie.js", () => ({
  verifyRefreshCookie: verifyRefreshCookieMock,
}));

jest.unstable_mockModule("../dist/createServiceToken.js", () => ({
  createServiceToken: createServiceTokenMock,
}));

jest.unstable_mockModule("../dist/authFetch.js", () => ({
  authFetch: authFetchMock,
}));

describe("refreshAccessToken", () => {
  beforeEach(() => {
    verifyRefreshCookieMock.mockReset();
    createServiceTokenMock.mockReset();
    authFetchMock.mockReset();
  });

  it("returns null when refresh cookie is invalid", async () => {
    const { refreshAccessToken } =
      await import("../dist/refreshAccessToken.js");
    verifyRefreshCookieMock.mockReturnValue(null);

    const result = await refreshAccessToken("bad.cookie", {
      authServerUrl: "https://auth.example.com",
      cookieSecret: "cookie-secret",
      serviceSecret: "service-secret",
      issuer: "https://frontend.example.com",
      audience: "https://auth.example.com",
      keyId: "dev-main",
    });

    expect(result).toBeNull();
  });

  it("returns refreshed session when refresh succeeds", async () => {
    const { refreshAccessToken } =
      await import("../dist/refreshAccessToken.js");

    verifyRefreshCookieMock.mockReturnValue({
      sub: "user-123",
      refreshToken: "refresh-token",
    });

    createServiceTokenMock.mockReturnValue("service.jwt");

    authFetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        sub: "user-123",
        token: "new-access",
        refreshToken: "new-refresh",
        roles: ["user"],
        email: "test@example.com",
        phone: "+14155552671",
        ttl: 300,
        refreshTtl: 3600,
      }),
    });

    const result = await refreshAccessToken("good.cookie", {
      authServerUrl: "https://auth.example.com",
      cookieSecret: "cookie-secret",
      serviceSecret: "service-secret",
      issuer: "https://frontend.example.com",
      audience: "https://auth.example.com",
      keyId: "dev-main",
    });

    expect(result.token).toBe("new-access");
    expect(result.email).toBe("test@example.com");
    expect(authFetchMock).toHaveBeenCalledWith(
      "https://auth.example.com/refresh",
      expect.objectContaining({
        method: "POST",
        headers: { Authorization: "Bearer refresh-token" },
      }),
    );
  });

  it("deduplicates concurrent refresh calls for the same refresh cookie", async () => {
    const { refreshAccessToken } =
      await import("../dist/refreshAccessToken.js");

    verifyRefreshCookieMock.mockReturnValue({
      sub: "user-123",
      refreshToken: "refresh-token",
    });

    authFetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        sub: "user-123",
        token: "new-access",
        refreshToken: "new-refresh",
        roles: ["user"],
        email: "test@example.com",
        phone: "+14155552671",
        ttl: 300,
        refreshTtl: 3600,
      }),
    });

    const [first, second] = await Promise.all([
      refreshAccessToken("good.cookie", {
        authServerUrl: "https://auth.example.com",
        cookieSecret: "cookie-secret",
        serviceSecret: "service-secret",
        issuer: "https://frontend.example.com",
        audience: "https://auth.example.com",
        keyId: "dev-main",
      }),
      refreshAccessToken("good.cookie", {
        authServerUrl: "https://auth.example.com",
        cookieSecret: "cookie-secret",
        serviceSecret: "service-secret",
        issuer: "https://frontend.example.com",
        audience: "https://auth.example.com",
        keyId: "dev-main",
      }),
    ]);

    expect(first).toEqual(second);
    expect(authFetchMock).toHaveBeenCalledTimes(1);
  });
});
