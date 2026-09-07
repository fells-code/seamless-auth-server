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

const UPSTREAM = {
  message: "Success",
  token: "access-token",
  refreshToken: "refresh-token",
  sub: "user-123",
  roles: ["user"],
  email: "person@example.com",
  phone: null,
  organizationId: "org-123",
  returnTo: "https://app.example.com/dashboard",
  ttl: 900,
  refreshTtl: 3600,
};

const OPTS = {
  authServerUrl: "https://auth.example.com",
  audience: "https://auth.example.com",
  accessCookieName: "access",
  refreshCookieName: "refresh",
};

/**
 * Every handler that issues session cookies, and how to call it.
 *
 * Enumerated in one place so a handler added later is covered by adding a line
 * rather than by remembering this invariant exists.
 */
const SESSION_HANDLERS = [
  {
    name: "finishLoginHandler",
    module: "../dist/handlers/finishLogin.js",
    input: { body: {} },
  },
  {
    name: "verifyLoginOtpHandler",
    module: "../dist/handlers/verifyLoginOtpHandler.js",
    input: { body: {}, channel: "email" },
  },
  {
    name: "finishOAuthLoginHandler",
    module: "../dist/handlers/oauthHandlers.js",
    input: { providerId: "google", body: {} },
  },
  {
    name: "pollMagicLinkConfirmationHandler",
    module: "../dist/handlers/pollMagicLinkConfirmationHandler.js",
    input: { body: {} },
  },
  {
    name: "switchOrganizationHandler",
    module: "../dist/handlers/switchOrganizationHandler.js",
    input: { organizationId: "org-123" },
  },
];

describe("session responses do not repeat the credentials in the body", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn();
    verifySignedAuthResponseMock.mockReset();
    verifySignedAuthResponseMock.mockResolvedValue({
      sub: "user-123",
      sid: "session-123",
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  // The tokens go out as httpOnly cookies so page scripts cannot read them.
  // Returning them in the body of the same response handed them straight back.
  it.each(SESSION_HANDLERS)("$name keeps the tokens out of the body", async entry => {
    const module = await import(entry.module);
    global.fetch.mockResolvedValue(createJsonResponse(200, UPSTREAM));

    const result = await module[entry.name](entry.input, OPTS);

    expect(result.body).toBeDefined();
    expect(result.body).not.toHaveProperty("token");
    expect(result.body).not.toHaveProperty("refreshToken");
    expect(JSON.stringify(result.body)).not.toContain("access-token");
    expect(JSON.stringify(result.body)).not.toContain("refresh-token");
  });

  it.each(SESSION_HANDLERS)("$name still carries what callers read", async entry => {
    const module = await import(entry.module);
    global.fetch.mockResolvedValue(createJsonResponse(200, UPSTREAM));

    const result = await module[entry.name](entry.input, OPTS);

    expect(result.body).toMatchObject({
      message: "Success",
      email: "person@example.com",
      organizationId: "org-123",
      returnTo: "https://app.example.com/dashboard",
    });
  });

  it.each(SESSION_HANDLERS)("$name still puts the access token in a cookie", async entry => {
    const module = await import(entry.module);
    global.fetch.mockResolvedValue(createJsonResponse(200, UPSTREAM));

    const result = await module[entry.name](entry.input, OPTS);

    expect(result.setCookies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "access",
          value: expect.objectContaining({ token: "access-token" }),
        }),
      ]),
    );
  });
});
