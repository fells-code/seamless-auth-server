// A refresh token presented again after its rotation completed is a replay. It
// must reach the auth API, whose reuse detection revokes the session family,
// rather than be handed the session the first caller got (#258). The one
// exception is a refresh cookie presented again within 5 seconds: browser tabs
// share one cookie jar, so a second tab sending the old cookie a moment late is
// expected, and it gets the session the first tab got.
import { jest } from "@jest/globals";

const verifyRefreshCookieMock = jest.fn();
const authFetchMock = jest.fn();

jest.unstable_mockModule("../dist/verifyRefreshCookie.js", () => ({
  verifyRefreshCookie: verifyRefreshCookieMock,
}));

jest.unstable_mockModule("../dist/authFetch.js", () => ({
  authFetch: authFetchMock,
}));

const { refreshAccessToken, refreshSessionToken, refreshBearerSession } =
  await import("../dist/refreshAccessToken.js");

const OPTS = {
  authServerUrl: "https://auth.example.com",
  cookieSecret: "cookie-secret-cookie-secret-cookie-secret",
  serviceSecret: "service-secret-service-secret-service-secret",
  issuer: "https://frontend.example.com",
  audience: "https://auth.example.com",
  keyId: "dev-main",
};

const ROTATED = {
  sub: "user-123",
  token: "new-access",
  refreshToken: "new-refresh",
  ttl: 300,
  refreshTtl: 3600,
};

const rotated = () => ({ ok: true, status: 200, json: async () => ROTATED });
const reused = () => ({
  ok: false,
  status: 401,
  json: async () => ({ error: "refresh_token_reused" }),
});

let counter = 0;
const unique = (label) => `${label}-${(counter += 1)}`;

const clock = {
  now: 0,
  install() {
    this.now = Date.now();
    jest.spyOn(Date, "now").mockImplementation(() => this.now);
  },
  advance(ms) {
    this.now += ms;
  },
};

describe("a completed refresh rotation is not replayed (#258)", () => {
  beforeEach(() => {
    verifyRefreshCookieMock.mockReset();
    authFetchMock.mockReset();
    authFetchMock.mockResolvedValueOnce(rotated()).mockResolvedValue(reused());
    clock.install();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("shares a completed cookie rotation with a replay inside 5 seconds", async () => {
    const cookie = unique("cookie");
    verifyRefreshCookieMock.mockReturnValue({ sub: "user-123", refreshToken: "old" });

    const firstTab = await refreshAccessToken(cookie, OPTS);
    clock.advance(4_999);
    const secondTab = await refreshAccessToken(cookie, OPTS);

    expect(firstTab).toEqual(ROTATED);
    expect(secondTab).toEqual(firstTab);
    expect(authFetchMock).toHaveBeenCalledTimes(1);
  });

  it("sends a refresh cookie replayed after 5 seconds to the auth API", async () => {
    const cookie = unique("cookie");
    verifyRefreshCookieMock.mockReturnValue({ sub: "user-123", refreshToken: "old" });

    const victim = await refreshAccessToken(cookie, OPTS);
    clock.advance(5_000);
    const attacker = await refreshAccessToken(cookie, OPTS);

    expect(victim).toEqual(ROTATED);
    expect(authFetchMock).toHaveBeenCalledTimes(2);
    expect(attacker).toBeNull();
  });

  it("does not keep a failed cookie rotation", async () => {
    const cookie = unique("cookie");
    verifyRefreshCookieMock.mockReturnValue({ sub: "user-123", refreshToken: "old" });
    authFetchMock.mockReset();
    authFetchMock.mockResolvedValueOnce(reused()).mockResolvedValue(rotated());

    const first = await refreshAccessToken(cookie, OPTS);
    const second = await refreshAccessToken(cookie, OPTS);

    expect(first).toBeNull();
    expect(second).toEqual(ROTATED);
    expect(authFetchMock).toHaveBeenCalledTimes(2);
  });

  it("sends a spent session token to the auth API after the rotation", async () => {
    const payload = { sub: "user-123", refreshToken: unique("token") };

    const victim = await refreshSessionToken(payload, OPTS);
    const attacker = await refreshSessionToken(payload, OPTS);

    expect(victim).toEqual(ROTATED);
    expect(authFetchMock).toHaveBeenCalledTimes(2);
    expect(attacker).toBeNull();
  });

  it("sends a stolen bearer refresh token to the auth API after the rotation", async () => {
    const token = unique("bearer");
    const opts = { authServerUrl: OPTS.authServerUrl };

    const victim = await refreshBearerSession(token, opts);
    const attacker = await refreshBearerSession(token, opts);

    expect(victim).toEqual({ status: 200, body: ROTATED });
    expect(authFetchMock).toHaveBeenCalledTimes(2);
    expect(attacker).toEqual({
      status: 401,
      body: { error: "refresh_token_reused" },
    });
  });

  it("sends a bearer replay inside 5 seconds to the auth API", async () => {
    const token = unique("bearer");
    const opts = { authServerUrl: OPTS.authServerUrl };

    const victim = await refreshBearerSession(token, opts);
    clock.advance(1_000);
    const attacker = await refreshBearerSession(token, opts);

    expect(victim).toEqual({ status: 200, body: ROTATED });
    expect(authFetchMock).toHaveBeenCalledTimes(2);
    expect(attacker).toEqual({
      status: 401,
      body: { error: "refresh_token_reused" },
    });
  });

  it("still collapses callers that race one rotation in flight", async () => {
    const token = unique("bearer");
    const opts = { authServerUrl: OPTS.authServerUrl };
    let release;
    authFetchMock.mockReset();
    authFetchMock.mockImplementationOnce(
      () => new Promise((resolve) => (release = () => resolve(rotated()))),
    );

    const first = refreshBearerSession(token, opts);
    const second = refreshBearerSession(token, opts);
    release();

    expect(await first).toEqual({ status: 200, body: ROTATED });
    expect(await second).toEqual({ status: 200, body: ROTATED });
    expect(authFetchMock).toHaveBeenCalledTimes(1);
  });
});
