import { jest } from "@jest/globals";

const authFetchMock = jest.fn();

jest.unstable_mockModule("../dist/authFetch.js", () => ({
  authFetch: authFetchMock,
}));

const { buildQueryString, buildUpstreamUrl, checkProxyIdentity, proxyRequest } =
  await import("../dist/proxyRequest.js");

function upstream(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

describe("buildQueryString", () => {
  it("forwards scalars, coercing numbers and booleans", () => {
    expect(buildQueryString({ limit: 10, active: true, q: "x" })).toBe(
      "limit=10&active=true&q=x",
    );
  });

  // The auth API's AuthEventQuerySchema accepts `type` as an array. Joining the
  // values into one comma-separated parameter matches no event type upstream.
  it("repeats an array rather than joining it", () => {
    expect(buildQueryString({ type: ["login", "logout"] })).toBe(
      "type=login&type=logout",
    );
  });

  it("drops null and undefined", () => {
    expect(buildQueryString({ a: null, b: undefined, c: "1" })).toBe("c=1");
  });

  it("drops a nested object instead of sending [object Object]", () => {
    expect(buildQueryString({ filter: { from: "x" }, ok: "1" })).toBe("ok=1");
  });

  it("drops non-scalar array members", () => {
    expect(buildQueryString({ t: ["a", null, { b: 1 }, "c"] })).toBe("t=a&t=c");
  });

  it("returns empty for no query", () => {
    expect(buildQueryString()).toBe("");
    expect(buildQueryString({})).toBe("");
  });
});

describe("buildUpstreamUrl", () => {
  it("joins the path whether or not it is rooted", () => {
    expect(buildUpstreamUrl("https://auth.test", "/organizations")).toBe(
      "https://auth.test/organizations",
    );
    expect(buildUpstreamUrl("https://auth.test", "organizations")).toBe(
      "https://auth.test/organizations",
    );
  });

  it("omits the separator when the query is empty", () => {
    expect(buildUpstreamUrl("https://auth.test", "/x", {})).toBe(
      "https://auth.test/x",
    );
  });
});

describe("checkProxyIdentity", () => {
  const base = {
    cookies: {},
    accessCookieName: "sa-access",
    preAuthCookieName: "sa-preauth",
    registrationCookieName: "sa-register",
  };

  it("rejects a request with no verified subject, and asks the caller to log it", () => {
    const rejection = checkProxyIdentity({ ...base, identity: "access" });

    expect(rejection).toMatchObject({
      status: 401,
      errorCode: "Unauthenticated request",
    });
    expect(rejection.warn).toBeTruthy();
  });

  // The payload survives a refresh, so it alone does not prove the request
  // carries the session this route needs.
  it.each([
    ["access", "access session required"],
    ["preAuth", "pre-auth session required"],
    ["register", "registration session required"],
  ])("rejects %s without its cookie", (identity, errorCode) => {
    expect(checkProxyIdentity({ ...base, subject: "u1", identity })).toEqual({
      status: 401,
      errorCode,
    });
  });

  it.each([
    ["access", "sa-access"],
    ["preAuth", "sa-preauth"],
    ["register", "sa-register"],
  ])("admits %s when its cookie is present", (identity, cookieName) => {
    expect(
      checkProxyIdentity({
        ...base,
        subject: "u1",
        identity,
        cookies: { [cookieName]: "value" },
      }),
    ).toBeUndefined();
  });

  it("does not accept a different identity's cookie", () => {
    expect(
      checkProxyIdentity({
        ...base,
        subject: "u1",
        identity: "access",
        cookies: { "sa-preauth": "value" },
      }),
    ).toEqual({ status: 401, errorCode: "access session required" });
  });
});

describe("proxyRequest", () => {
  beforeEach(() => authFetchMock.mockReset());

  it("forwards method, headers, body, and query", async () => {
    authFetchMock.mockResolvedValue(upstream(200, { ok: true }));

    const result = await proxyRequest({
      authServerUrl: "https://auth.test",
      path: "organizations",
      method: "POST",
      authorization: "Bearer a",
      serviceAuthorization: "svc",
      forwardedClientIp: "203.0.113.9",
      query: { limit: 5 },
      body: { name: "Acme" },
    });

    expect(authFetchMock).toHaveBeenCalledWith(
      "https://auth.test/organizations?limit=5",
      {
        method: "POST",
        authorization: "Bearer a",
        serviceAuthorization: "svc",
        forwardedClientIp: "203.0.113.9",
        body: { name: "Acme" },
      },
    );
    expect(result).toEqual({ status: 200, body: { ok: true } });
  });

  it("omits the body on a GET", async () => {
    authFetchMock.mockResolvedValue(upstream(200, {}));

    await proxyRequest({
      authServerUrl: "https://auth.test",
      path: "/totp/status",
      method: "GET",
      body: { ignored: true },
    });

    expect(authFetchMock.mock.calls[0][1]).not.toHaveProperty("body");
  });

  it("defaults to POST", async () => {
    authFetchMock.mockResolvedValue(upstream(200, {}));

    await proxyRequest({ authServerUrl: "https://auth.test", path: "/x" });

    expect(authFetchMock.mock.calls[0][1].method).toBe("POST");
  });

  // A proxied route cannot interpret the response, so a failure body is
  // returned as-is rather than reshaped into a code.
  it("returns an upstream failure body untouched", async () => {
    authFetchMock.mockResolvedValue(upstream(403, { error: "forbidden" }));

    expect(
      await proxyRequest({ authServerUrl: "https://auth.test", path: "/x" }),
    ).toEqual({ status: 403, body: { error: "forbidden" } });
  });
});
