import { jest } from "@jest/globals";
import { exportJWK, generateKeyPair, SignJWT } from "jose";

const {
  applyResult,
  checkProxyIdentity,
  refreshBearerSession,
  resolveAuthTransport,
  sessionResult,
  AUTH_TRANSPORT_HEADER,
} = await import("../dist/index.js");

describe("resolveAuthTransport", () => {
  it("defaults to cookie transport", () => {
    expect(resolveAuthTransport(undefined)).toBe("cookie");
    expect(resolveAuthTransport("")).toBe("cookie");
    expect(resolveAuthTransport("cookie")).toBe("cookie");
    expect(resolveAuthTransport("token")).toBe("cookie");
  });

  it("selects bearer transport from the header, case-insensitively", () => {
    expect(AUTH_TRANSPORT_HEADER).toBe("x-seamless-auth-transport");
    expect(resolveAuthTransport("bearer")).toBe("bearer");
    expect(resolveAuthTransport(" Bearer ")).toBe("bearer");
    expect(resolveAuthTransport(["bearer", "cookie"])).toBe("bearer");
  });
});

describe("checkProxyIdentity in bearer transport", () => {
  const base = {
    cookies: {},
    accessCookieName: "seamless-access",
    preAuthCookieName: "seamless-ephemeral",
    registrationCookieName: "seamless-ephemeral",
    transport: "bearer",
  };

  it("passes when any bearer token is present, leaving the kind to the auth API", () => {
    for (const identity of ["access", "preAuth", "register"]) {
      expect(
        checkProxyIdentity({ ...base, identity, authorization: "Bearer abc" }),
      ).toBeUndefined();
    }
  });

  it("rejects with the identity's error when no bearer token is sent", () => {
    expect(checkProxyIdentity({ ...base, identity: "access" })).toEqual({
      status: 401,
      errorCode: "access session required",
    });
    expect(
      checkProxyIdentity({ ...base, identity: "preAuth", authorization: "Basic x" }),
    ).toEqual({ status: 401, errorCode: "pre-auth session required" });
    expect(checkProxyIdentity({ ...base, identity: "register" })).toEqual({
      status: 401,
      errorCode: "registration session required",
    });
  });

  it("ignores cookies in bearer transport", () => {
    expect(
      checkProxyIdentity({
        ...base,
        identity: "access",
        subject: "user-1",
        cookies: { "seamless-access": "cookie" },
      }),
    ).toEqual({ status: 401, errorCode: "access session required" });
  });
});

describe("applyResult in bearer transport", () => {
  const opts = {
    cookieSecret: "cookie-secret-cookie-secret-cookie-secret",
    cookieSecure: true,
  };

  function adapter() {
    return { setCookie: jest.fn(), clearCookie: jest.fn(), send: jest.fn() };
  }

  const result = {
    status: 200,
    body: { token: "t" },
    setCookies: [{ name: "seamless-access", value: { sub: "u" }, ttl: 300 }],
    clearCookies: ["seamless-ephemeral"],
  };

  it("writes no cookies and sends the body", () => {
    const a = adapter();
    applyResult(result, a, { ...opts, transport: "bearer" });

    expect(a.setCookie).not.toHaveBeenCalled();
    expect(a.clearCookie).not.toHaveBeenCalled();
    expect(a.send).toHaveBeenCalledWith(200, { token: "t" });
  });

  it("still writes cookies in cookie transport", () => {
    const a = adapter();
    applyResult(result, a, opts);

    expect(a.setCookie).toHaveBeenCalledTimes(1);
    expect(a.clearCookie).toHaveBeenCalledTimes(1);
  });
});

describe("sessionResult", () => {
  const originalFetch = global.fetch;
  const server = "https://session-result.example.com";
  let token;

  beforeAll(async () => {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const jwk = { ...(await exportJWK(publicKey)), alg: "RS256", kid: "k1", use: "sig" };
    global.fetch = jest.fn(
      async () =>
        new Response(JSON.stringify({ keys: [jwk] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    token = await new SignJWT({ sub: "user-1", typ: "access", sid: "s-1" })
      .setProtectedHeader({ alg: "RS256", kid: "k1" })
      .setIssuer(server)
      .setAudience(server)
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  const data = () => ({
    sub: "user-1",
    token,
    refreshToken: "refresh-1",
    roles: ["athlete"],
    ttl: 300,
    refreshTtl: 3600,
    message: "ok",
  });

  const opts = {
    authServerUrl: server,
    audience: server,
    accessCookieName: "seamless-access",
    refreshCookieName: "seamless-refresh",
  };

  it("returns the body whole with no cookies in bearer transport", async () => {
    const out = await sessionResult(data(), { ...opts, transport: "bearer" });

    expect(out.setCookies).toBeUndefined();
    expect(out.body).toEqual(data());
  });

  it("strips the tokens and mints cookies in cookie transport", async () => {
    const out = await sessionResult(data(), opts);

    expect(out.body).toEqual({
      sub: "user-1",
      roles: ["athlete"],
      ttl: 300,
      refreshTtl: 3600,
      message: "ok",
    });
    expect(out.setCookies.map((c) => c.name)).toEqual([
      "seamless-access",
      "seamless-refresh",
    ]);
  });

  it("still refuses a body whose token does not match its subject in bearer transport", async () => {
    await expect(
      sessionResult({ ...data(), sub: "someone-else" }, { ...opts, transport: "bearer" }),
    ).rejects.toThrow(/Signature mismatch/);
  });
});

describe("refreshBearerSession", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("forwards the refresh token and returns the rotated session", async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ token: "a2", refreshToken: "r2" }),
    }));

    const out = await refreshBearerSession("r1", {
      authServerUrl: "https://refresh-a.example.com",
      serviceAuthorization: "Bearer service",
      forwardedClientIp: "203.0.113.9",
    });

    expect(out).toEqual({ status: 200, body: { token: "a2", refreshToken: "r2" } });
    expect(global.fetch).toHaveBeenCalledWith(
      "https://refresh-a.example.com/refresh",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer r1",
          "x-seamless-service-token": "Bearer service",
          "x-seamless-client-ip": "203.0.113.9",
        }),
      }),
    );
  });

  it("collapses concurrent rotations of the same token into one upstream call", async () => {
    let resolveUpstream;
    global.fetch = jest.fn(
      () =>
        new Promise((resolve) => {
          resolveUpstream = () =>
            resolve({
              ok: true,
              status: 200,
              text: async () => JSON.stringify({ token: "a3", refreshToken: "r3" }),
            });
        }),
    );

    const opts = { authServerUrl: "https://refresh-b.example.com" };
    const first = refreshBearerSession("same-token", opts);
    const second = refreshBearerSession("same-token", opts);
    resolveUpstream();

    const [a, b] = await Promise.all([first, second]);
    expect(a.body).toEqual({ token: "a3", refreshToken: "r3" });
    expect(b.body).toEqual(a.body);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    // A straggler just after completion gets the same rotated pair rather than
    // replaying a token the auth API has already retired.
    const third = await refreshBearerSession("same-token", opts);
    expect(third.body).toEqual(a.body);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("passes the auth API's failure through and does not cache it", async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ error: "refresh_token_reused" }),
    }));

    const opts = { authServerUrl: "https://refresh-c.example.com" };
    const first = await refreshBearerSession("spent", opts);
    const second = await refreshBearerSession("spent", opts);

    expect(first).toEqual({ status: 401, body: { error: "refresh_token_reused" } });
    expect(second).toEqual(first);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
