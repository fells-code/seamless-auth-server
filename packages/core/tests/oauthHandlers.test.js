import { jest } from "@jest/globals";

const verifySignedAuthResponseMock = jest.fn();

jest.unstable_mockModule("../dist/verifySignedAuthResponse.js", () => ({
  verifySignedAuthResponse: verifySignedAuthResponseMock,
}));

function createJsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

describe("oauthHandlers", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn();
    verifySignedAuthResponseMock.mockReset();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("starts OAuth login through the auth server", async () => {
    const { startOAuthLoginHandler } = await import(
      "../dist/handlers/oauthHandlers.js"
    );

    global.fetch.mockResolvedValue(
      createJsonResponse(200, {
        authorizationUrl: "https://provider.example.com/auth",
        state: "state",
      }),
    );

    const result = await startOAuthLoginHandler(
      {
        providerId: "google",
        body: { redirectUri: "https://app.example.com/oauth/callback" },
      },
      { authServerUrl: "https://auth.example.com" },
    );

    expect(result).toEqual({
      status: 200,
      body: {
        authorizationUrl: "https://provider.example.com/auth",
        state: "state",
      },
    });
    expect(global.fetch).toHaveBeenCalledWith(
      "https://auth.example.com/oauth/google/start",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  it("finishes OAuth login and returns access and refresh cookies", async () => {
    const { finishOAuthLoginHandler } = await import(
      "../dist/handlers/oauthHandlers.js"
    );

    global.fetch.mockResolvedValue(
      createJsonResponse(200, {
        message: "Success",
        token: "access-token",
        refreshToken: "refresh-token",
        sub: "user-123",
        roles: ["user"],
        email: "person@example.com",
        phone: "oauth:google:provider-user",
        organizationId: "org-123",
        ttl: 900,
        refreshTtl: 3600,
      }),
    );
    verifySignedAuthResponseMock.mockResolvedValue({
      sub: "user-123",
      sid: "session-123",
    });

    const result = await finishOAuthLoginHandler(
      {
        providerId: "google",
        body: { code: "code", state: "state" },
      },
      {
        authServerUrl: "https://auth.example.com",
        accessCookieName: "access",
        refreshCookieName: "refresh",
      },
    );

    expect(result.status).toBe(200);
    expect(result.setCookies).toEqual([
      expect.objectContaining({
        name: "access",
        value: expect.objectContaining({
          sub: "user-123",
          sessionId: "session-123",
          token: "access-token",
          organizationId: "org-123",
        }),
      }),
      expect.objectContaining({
        name: "refresh",
        value: {
          sub: "user-123",
          refreshToken: "refresh-token",
        },
      }),
    ]);
  });
});
