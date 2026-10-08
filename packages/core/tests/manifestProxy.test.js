import { jest } from "@jest/globals";

const authFetchMock = jest.fn();
const verifySignedAuthResponseMock = jest.fn();
const applyExternalDeliveryMock = jest.fn();

jest.unstable_mockModule("../dist/authFetch.js", () => ({
  authFetch: authFetchMock,
}));
jest.unstable_mockModule("../dist/verifySignedAuthResponse.js", () => ({
  verifySignedAuthResponse: verifySignedAuthResponseMock,
}));
jest.unstable_mockModule("../dist/deliverAuthMessage.js", () => ({
  applyExternalDelivery: applyExternalDeliveryMock,
}));

const { handleManifestRoute } = await import("../dist/manifestProxy.js");

const OPTIONS = {
  authServerUrl: "https://auth.test",
  audience: "https://auth.test",
  cookieDomain: "acme.test",
  accessCookieName: "seamless-access",
  registrationCookieName: "seamless-ephemeral",
  preAuthCookieName: "seamless-ephemeral",
  refreshCookieName: "seamless-refresh",
  serviceAuthorization: "Bearer proxy-token",
  deliveryAuthorization: "Bearer delivery-token",
};

const SESSION = {
  message: "Success",
  sub: "user-1",
  token: "access-token",
  refreshToken: "refresh-token",
  ttl: 300,
  refreshTtl: 3600,
};

function upstream(status, body, contentType = "application/json") {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(contentType ? { "content-type": contentType } : {}),
    body: null,
    json: async () => body,
  };
}

function input(route, overrides = {}) {
  return {
    route,
    params: {},
    transport: "cookie",
    cookies: {},
    ...overrides,
  };
}

const ACCESS_COOKIES = {
  cookiePayload: { sub: "user-1", token: "access-token" },
  cookies: { "seamless-access": "signed" },
};

beforeEach(() => {
  authFetchMock.mockReset();
  verifySignedAuthResponseMock.mockReset();
  verifySignedAuthResponseMock.mockResolvedValue({ sub: "user-1", sid: "s-1" });
  applyExternalDeliveryMock.mockReset();
});

describe("handleManifestRoute", () => {
  it("forwards an access route with the held token, path parameters and query", async () => {
    authFetchMock.mockResolvedValue(upstream(200, { ok: true }));

    const result = await handleManifestRoute(
      input(
        { method: "GET", path: "/admin/users/{userId}", credential: "access" },
        { ...ACCESS_COOKIES, params: { userId: "a/b" }, query: { limit: 5 } },
      ),
      OPTIONS,
    );

    expect(authFetchMock).toHaveBeenCalledWith(
      "https://auth.test/admin/users/a%2Fb?limit=5",
      expect.objectContaining({
        method: "GET",
        authorization: "Bearer access-token",
        serviceAuthorization: "Bearer proxy-token",
      }),
    );
    expect(authFetchMock.mock.calls[0][1]).not.toHaveProperty("body");
    expect(result).toEqual({ status: 200, body: { ok: true } });
  });

  it("refuses a cookie-transport request without the route's cookie", async () => {
    const result = await handleManifestRoute(
      input(
        { method: "POST", path: "/totp/verify-login", credential: "preAuth" },
        { cookiePayload: { sub: "user-1", token: "t" }, cookies: {} },
      ),
      OPTIONS,
    );

    expect(result).toEqual({ status: 401, errorCode: "pre-auth session required" });
    expect(authFetchMock).not.toHaveBeenCalled();
  });

  it("sends no user credential on a public route", async () => {
    authFetchMock.mockResolvedValue(upstream(200, { providers: [] }));

    await handleManifestRoute(
      input({ method: "GET", path: "/oauth/providers", credential: "none" }),
      OPTIONS,
    );

    expect(authFetchMock.mock.calls[0][1].authorization).toBeUndefined();
  });

  it("does not proxy a refresh-credential route", async () => {
    const result = await handleManifestRoute(
      input({ method: "POST", path: "/refresh", credential: "refresh", issues: "session" }),
      OPTIONS,
    );

    expect(result.status).toBe(404);
    expect(authFetchMock).not.toHaveBeenCalled();
  });

  it("passes an upstream failure through", async () => {
    authFetchMock.mockResolvedValue(upstream(403, { error: "forbidden" }));

    const result = await handleManifestRoute(
      input({ method: "GET", path: "/admin/users", credential: "access" }, ACCESS_COOKIES),
      OPTIONS,
    );

    expect(result).toEqual({ status: 403, errorBody: { error: "forbidden" } });
  });

  it("streams a response that is not JSON", async () => {
    authFetchMock.mockResolvedValue(upstream(200, undefined, "application/x-ndjson"));

    const result = await handleManifestRoute(
      input(
        { method: "GET", path: "/admin/auth-events/export", credential: "access" },
        ACCESS_COOKIES,
      ),
      OPTIONS,
    );

    expect(result).toEqual({
      status: 200,
      raw: { headers: { "content-type": "application/x-ndjson" }, body: null },
    });
  });

  describe("issuing a session", () => {
    const route = {
      method: "POST",
      path: "/totp/verify-login",
      credential: "preAuth",
      issues: "session",
    };
    const preAuth = {
      cookiePayload: { sub: "user-1", token: "pre-auth-token" },
      cookies: { "seamless-ephemeral": "signed" },
    };

    it("sets access and refresh cookies and keeps tokens out of the body", async () => {
      authFetchMock.mockResolvedValue(upstream(200, SESSION));

      const result = await handleManifestRoute(input(route, preAuth), OPTIONS);

      expect(authFetchMock.mock.calls[0][1].authorization).toBe("Bearer pre-auth-token");
      expect(result.body).toEqual({
        message: "Success",
        sub: "user-1",
        ttl: 300,
        refreshTtl: 3600,
      });
      expect(result.setCookies.map((cookie) => cookie.name)).toEqual([
        "seamless-access",
        "seamless-refresh",
      ]);
      expect(result.setCookies[0].value).toMatchObject({
        sub: "user-1",
        sessionId: "s-1",
        token: "access-token",
      });
    });

    it("refuses a response whose token does not verify", async () => {
      authFetchMock.mockResolvedValue(upstream(200, SESSION));
      verifySignedAuthResponseMock.mockResolvedValue(null);

      await expect(handleManifestRoute(input(route, preAuth), OPTIONS)).rejects.toThrow(
        /Invalid signed response/,
      );
    });

    it("issues nothing when the response carries no session", async () => {
      authFetchMock.mockResolvedValue(upstream(200, { message: "Phone pending" }));

      const result = await handleManifestRoute(input(route, preAuth), OPTIONS);

      expect(result).toEqual({ status: 200, body: { message: "Phone pending" } });
    });

    it("returns the whole body and sets no cookies in bearer transport", async () => {
      authFetchMock.mockResolvedValue(upstream(200, SESSION));

      const result = await handleManifestRoute(
        input(route, { transport: "bearer", authorization: "Bearer client-token" }),
        OPTIONS,
      );

      expect(authFetchMock.mock.calls[0][1].authorization).toBe("Bearer client-token");
      expect(verifySignedAuthResponseMock).toHaveBeenCalled();
      expect(result).toEqual({ status: 200, body: SESSION });
    });

    it("reissues only the access cookie for an access reissue", async () => {
      authFetchMock.mockResolvedValue(upstream(200, SESSION));

      const result = await handleManifestRoute(
        input(
          {
            method: "POST",
            path: "/organizations/{organizationId}/switch",
            credential: "access",
            issues: "access",
          },
          { ...ACCESS_COOKIES, params: { organizationId: "org-1" } },
        ),
        OPTIONS,
      );

      expect(result.setCookies.map((cookie) => cookie.name)).toEqual(["seamless-access"]);
    });

    it("stores an ephemeral token under the route's cookie", async () => {
      authFetchMock.mockResolvedValue(
        upstream(200, { message: "ok", sub: "user-1", token: "reg-token", ttl: 300 }),
      );

      const result = await handleManifestRoute(
        input({
          method: "POST",
          path: "/registration/register",
          credential: "none",
          issues: "registration",
        }),
        OPTIONS,
      );

      expect(result.setCookies).toEqual([
        {
          name: "seamless-ephemeral",
          value: { sub: "user-1", token: "reg-token" },
          ttl: 300,
          domain: "acme.test",
        },
      ]);
      expect(result.body).toEqual({ message: "ok", sub: "user-1", ttl: 300 });
    });
  });

  it("passes only picked fields to the browser", async () => {
    authFetchMock.mockResolvedValue(
      upstream(200, {
        message: "Success",
        identifierType: "email",
        sub: "user-1",
        token: "pre-auth",
        ttl: 300,
      }),
    );

    const result = await handleManifestRoute(
      input({
        method: "POST",
        path: "/login",
        credential: "none",
        issues: "preAuth",
        body: { pick: ["message", "identifierType", "loginMethods"] },
      }),
      OPTIONS,
    );

    expect(result.body).toEqual({ message: "Success", identifierType: "email" });
  });

  // The auth API re-mints the ephemeral token on an OTP send. The cookie already
  // holds one, and a page script must not be able to read it.
  it("strips a token from a route that issues nothing", async () => {
    authFetchMock.mockResolvedValue(upstream(200, { message: "success", token: "re-minted" }));

    const result = await handleManifestRoute(
      input(
        { method: "POST", path: "/otp/generate-login-email-otp", credential: "preAuth" },
        {
          cookiePayload: { sub: "user-1", token: "pre-auth" },
          cookies: { "seamless-ephemeral": "signed" },
        },
      ),
      OPTIONS,
    );

    expect(result.body).toEqual({ message: "success" });
  });

  it("clears the declared cookies once, even when two share a name", async () => {
    authFetchMock.mockResolvedValue(upstream(200, { message: "deleted" }));

    const result = await handleManifestRoute(
      input(
        {
          method: "DELETE",
          path: "/users/delete",
          credential: "access",
          clears: ["access", "registration", "preAuth", "refresh"],
        },
        ACCESS_COOKIES,
      ),
      OPTIONS,
    );

    expect(result.clearCookies).toEqual([
      "seamless-access",
      "seamless-ephemeral",
      "seamless-refresh",
    ]);
  });

  describe("delivery routes", () => {
    const route = {
      method: "POST",
      path: "/magic-link",
      credential: "preAuth",
      delivery: true,
    };
    const preAuth = {
      cookiePayload: { sub: "user-1", token: "pre-auth" },
      cookies: { "seamless-ephemeral": "signed" },
    };

    it("asks for external delivery and delivers when messaging is configured", async () => {
      const messaging = { email: { send: jest.fn() } };
      authFetchMock.mockResolvedValue(
        upstream(200, { message: "sent", delivery: { kind: "magic_link_email" } }),
      );
      applyExternalDeliveryMock.mockResolvedValue({ message: "sent" });

      const result = await handleManifestRoute(input(route, preAuth), {
        ...OPTIONS,
        messaging,
      });

      expect(authFetchMock.mock.calls[0][1]).toMatchObject({
        serviceAuthorization: "Bearer delivery-token",
        headers: { "x-seamless-auth-delivery-mode": "external" },
      });
      expect(applyExternalDeliveryMock).toHaveBeenCalledWith(messaging, {
        message: "sent",
        delivery: { kind: "magic_link_email" },
      });
      expect(result.body).toEqual({ message: "sent" });
    });

    it("lets the auth API deliver when no messaging is configured", async () => {
      authFetchMock.mockResolvedValue(upstream(200, { message: "sent" }));

      await handleManifestRoute(input(route, preAuth), OPTIONS);

      expect(authFetchMock.mock.calls[0][1]).toMatchObject({
        serviceAuthorization: "Bearer proxy-token",
      });
      expect(authFetchMock.mock.calls[0][1]).not.toHaveProperty("headers");
      expect(applyExternalDeliveryMock).not.toHaveBeenCalled();
    });
  });
});
