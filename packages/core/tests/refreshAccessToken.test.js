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
    expect(authFetchMock).toHaveBeenCalledWith(
      "https://auth.example.com/refresh",
      expect.objectContaining({
        method: "GET",
        headers: { Authorization: "Bearer service.jwt" },
      }),
    );
  });
});
