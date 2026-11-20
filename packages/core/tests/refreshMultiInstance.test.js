// Two adapter instances refreshing the same cookie at once (fells-code/seamless-auth-server#285).
// The auth API holds a short replay window: concurrent callers presenting the
// same refresh token R1 each get 200 with the same successor R2, and a minted
// access token that carries the same sid. Each instance has its own in-process
// state, so nothing here may assume one winner.
import { jest } from "@jest/globals";

const verifyRefreshCookieMock = jest.fn();
const authFetchMock = jest.fn();
const verifySignedAuthResponseMock = jest.fn();

jest.unstable_mockModule("../dist/verifyRefreshCookie.js", () => ({
  verifyRefreshCookie: verifyRefreshCookieMock,
}));
jest.unstable_mockModule("../dist/authFetch.js", () => ({
  authFetch: authFetchMock,
  UPSTREAM_UNAVAILABLE_ERROR_CODE: "upstream_unavailable",
}));
jest.unstable_mockModule("../dist/verifySignedAuthResponse.js", () => ({
  verifySignedAuthResponse: verifySignedAuthResponseMock,
}));

const OPTS = {
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

const jwt = (payload) =>
  `e30.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.sig`;

const json = (status, body) => ({ ok: status < 400, status, json: async () => body });

// A fresh module graph is a separate adapter process as far as the in-flight
// and completed-refresh state is concerned.
async function newInstance() {
  jest.resetModules();
  const { ensureCookies } = await import("../dist/ensureCookies.js");
  return ensureCookies;
}

const request = { path: "/users/me", cookies: { refresh: "r1.signed.cookie" } };

describe("concurrent refresh across adapter instances", () => {
  beforeEach(() => {
    authFetchMock.mockReset();
    verifyRefreshCookieMock.mockReset();
    verifySignedAuthResponseMock.mockReset();
    verifyRefreshCookieMock.mockReturnValue({ sub: "user-1", refreshToken: "R1" });
    verifySignedAuthResponseMock.mockImplementation(async (token) =>
      JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()),
    );
  });

  it("gives both instances the same successor refresh token and session id", async () => {
    let call = 0;
    // The API contract: the token is minted per call, everything else is the
    // one successor, including for the caller that lost the rotation race.
    authFetchMock.mockImplementation(async () => {
      call += 1;
      return json(200, {
        sub: "user-1",
        sessionId: "sid-1",
        token: jwt({ typ: "access", sub: "user-1", sid: "sid-1", jti: `jti-${call}` }),
        refreshToken: "R2",
        refreshTtl: 3600,
        roles: ["user"],
        organizationId: "org-1",
        ttl: 300,
      });
    });

    const instanceA = await newInstance();
    const instanceB = await newInstance();
    expect(instanceB).not.toBe(instanceA);

    const [a, b] = await Promise.all([
      instanceA(request, OPTS),
      instanceB(request, OPTS),
    ]);

    // Each instance went to the API: there is no shared state to deduplicate on.
    expect(authFetchMock).toHaveBeenCalledTimes(2);

    for (const result of [a, b]) {
      expect(result.type).toBe("ok");
      expect(result.user).toMatchObject({ sub: "user-1", sessionId: "sid-1", refreshed: true });
    }

    const [accessA, refreshA] = a.setCookies;
    const [accessB, refreshB] = b.setCookies;

    expect(refreshA.name).toBe("refresh");
    expect(refreshA.value).toEqual(refreshB.value);
    expect(refreshA.value.refreshToken).toBe("R2");
    expect(refreshA.ttl).toBe(refreshB.ttl);
    expect(accessA.value.sessionId).toBe("sid-1");
    expect(accessB.value.sessionId).toBe("sid-1");
    expect(accessA.value.token).not.toBe(accessB.value.token);
  });

  it("clears the cookies and does not retry when the API answers refresh_token_reused", async () => {
    authFetchMock.mockImplementation(async () =>
      json(401, { error: "refresh_token_reused" }),
    );

    const instance = await newInstance();
    const result = await instance(request, OPTS);

    expect(result.type).toBe("error");
    expect(result.status).toBe(401);
    expect(result.clearCookies).toEqual(
      expect.arrayContaining(["access", "registration", "refresh"]),
    );
    expect(result.setCookies).toBeUndefined();
    expect(authFetchMock).toHaveBeenCalledTimes(1);

    // The refusal is not remembered as a session, so a later request is judged
    // by the API again rather than handed anything.
    authFetchMock.mockClear();
    const again = await instance(request, OPTS);
    expect(again.status).toBe(401);
    expect(again.clearCookies).toContain("refresh");
    expect(authFetchMock).toHaveBeenCalledTimes(1);
  });
});
