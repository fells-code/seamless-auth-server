import { jest } from "@jest/globals";

const authFetchMock = jest.fn();
const issueSessionCookiesMock = jest.fn();
const warnMock = jest.fn();

jest.unstable_mockModule("../dist/authFetch.js", () => ({
  authFetch: authFetchMock,
}));

jest.unstable_mockModule("../dist/upstreamSession.js", () => ({
  issueSessionCookies: issueSessionCookiesMock,
}));

const { setSeamlessLogger } = await import("../dist/logger.js");
const { refreshAfterRecoveryEnrollment } = await import(
  "../dist/recoveryEnrollment.js"
);

const unsigned = (claims) =>
  `e30.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.sig`;
const RECOVERY = unsigned({ typ: "access", recovery: true });

const OPTIONS = {
  authServerUrl: "https://auth.example.com",
  accessCookieName: "seamless-access",
  registrationCookieName: "seamless-ephemeral",
  refreshCookieName: "seamless-refresh",
  preAuthCookieName: "seamless-ephemeral",
  cookieSecret: "cookie-secret-cookie-secret-cookie-secret",
  serviceSecret: "service-secret-service-secret-service-secret",
  issuer: "seamless-portal-api",
  audience: "seamless-auth",
  keyId: "dev-main",
};

let run = 0;

function input(overrides = {}) {
  run += 1;
  return {
    method: "post",
    path: "/totp/enroll/verify",
    status: 200,
    accessToken: RECOVERY,
    queuedCookies: [
      {
        name: "seamless-refresh",
        value: { sub: "u1", refreshToken: `queued-${run}` },
        ttl: 3600,
      },
    ],
    ...overrides,
  };
}

const ROTATED = { sub: "u1", token: "access", refreshToken: "next", ttl: 300, refreshTtl: 3600 };

describe("refreshAfterRecoveryEnrollment", () => {
  beforeEach(() => {
    authFetchMock.mockReset();
    issueSessionCookiesMock.mockReset();
    warnMock.mockReset();
    setSeamlessLogger({ warn: warnMock, error: jest.fn(), info: jest.fn() });
  });

  it.each([
    ["another route", { path: "/users/me" }],
    ["a failed enrollment", { status: 400 }],
    ["an informational status", { status: 101 }],
    ["an ordinary session", { accessToken: unsigned({ typ: "access" }) }],
    ["no access token", { accessToken: undefined }],
    ["a token that is not a JWT", { accessToken: "opaque" }],
  ])("does nothing for %s", async (_label, overrides) => {
    expect(await refreshAfterRecoveryEnrollment(input(overrides), OPTIONS)).toBeUndefined();
    expect(authFetchMock).not.toHaveBeenCalled();
  });

  it("rotates the refresh token queued in this request", async () => {
    authFetchMock.mockResolvedValue({ ok: true, json: async () => ROTATED });
    issueSessionCookiesMock.mockResolvedValue([{ name: "seamless-access" }]);

    const request = input({ path: "/WEBAUTHN/register/finish", status: 204 });
    const cookies = await refreshAfterRecoveryEnrollment(request, OPTIONS);

    expect(cookies).toEqual([{ name: "seamless-access" }]);
    expect(authFetchMock).toHaveBeenCalledWith(
      "https://auth.example.com/refresh",
      expect.objectContaining({
        authorization: `Bearer ${request.queuedCookies[0].value.refreshToken}`,
      }),
    );
    expect(issueSessionCookiesMock).toHaveBeenCalledWith(
      ROTATED,
      expect.objectContaining({
        audience: "https://auth.example.com",
        refreshCookieName: "seamless-refresh",
      }),
    );
  });

  it("answers nothing and warns when there is no refresh token to rotate", async () => {
    const cookies = await refreshAfterRecoveryEnrollment(
      input({ queuedCookies: undefined }),
      OPTIONS,
    );

    expect(cookies).toBeUndefined();
    expect(warnMock).toHaveBeenCalledWith(
      expect.stringContaining("Could not refresh a recovery session after enrollment"),
    );
  });

  it("falls back to the refresh cookie, and answers nothing when it is invalid", async () => {
    const cookies = await refreshAfterRecoveryEnrollment(
      input({ queuedCookies: [], refreshCookie: "not.a.cookie" }),
      OPTIONS,
    );

    expect(cookies).toBeUndefined();
    expect(authFetchMock).not.toHaveBeenCalled();
  });

  it("answers nothing when the auth API refuses the refresh", async () => {
    authFetchMock.mockResolvedValue({ ok: false, json: async () => ({}) });

    expect(await refreshAfterRecoveryEnrollment(input(), OPTIONS)).toBeUndefined();
    expect(issueSessionCookiesMock).not.toHaveBeenCalled();
  });

  it("answers nothing when the rotated token fails verification", async () => {
    authFetchMock.mockResolvedValue({ ok: true, json: async () => ROTATED });
    issueSessionCookiesMock.mockRejectedValue("not an error");

    expect(await refreshAfterRecoveryEnrollment(input(), OPTIONS)).toBeUndefined();
    expect(warnMock).toHaveBeenCalledWith(expect.stringContaining("unknown error"));
  });
});
