import { jest } from "@jest/globals";

const verifySignedAuthResponseMock = jest.fn();

jest.unstable_mockModule("../dist/verifySignedAuthResponse.js", () => ({
  verifySignedAuthResponse: verifySignedAuthResponseMock,
}));

const { issueSessionCookies, verifyUpstreamSession } = await import(
  "../dist/upstreamSession.js"
);

const SESSION = {
  sub: "user-1",
  token: "access-token",
  refreshToken: "refresh-token",
  roles: ["admin"],
  email: "user@acme.test",
  phone: null,
  organizationId: "org-1",
  ttl: 300,
  refreshTtl: 3600,
};

const OPTIONS = {
  authServerUrl: "https://auth.test",
  audience: "https://auth.test",
  accessCookieName: "seamless-access",
  refreshCookieName: "seamless-refresh",
  cookieDomain: "acme.test",
};

beforeEach(() => verifySignedAuthResponseMock.mockReset());

describe("verifyUpstreamSession", () => {
  it("returns the session id from the sid claim", async () => {
    verifySignedAuthResponseMock.mockResolvedValue({
      sub: "user-1",
      sid: "s-1",
    });

    expect(
      await verifyUpstreamSession(SESSION, "https://auth.test", "aud"),
    ).toEqual({ sessionId: "s-1" });
  });

  it("omits the session id when the claim is absent or not a string", async () => {
    verifySignedAuthResponseMock.mockResolvedValue({ sub: "user-1" });
    expect(
      (await verifyUpstreamSession(SESSION, "https://auth.test", "aud"))
        .sessionId,
    ).toBeUndefined();

    verifySignedAuthResponseMock.mockResolvedValue({ sub: "user-1", sid: 7 });
    expect(
      (await verifyUpstreamSession(SESSION, "https://auth.test", "aud"))
        .sessionId,
    ).toBeUndefined();
  });

  // Neither is a rejected login. Both mean the response cannot be trusted, and
  // continuing would mint a session from it.
  it("throws on an unverifiable response", async () => {
    verifySignedAuthResponseMock.mockResolvedValue(null);

    await expect(
      verifyUpstreamSession(SESSION, "https://auth.test", "aud"),
    ).rejects.toThrow("Invalid signed response from Auth Server");
  });

  it("throws when the token describes a different subject", async () => {
    verifySignedAuthResponseMock.mockResolvedValue({ sub: "someone-else" });

    await expect(
      verifyUpstreamSession(SESSION, "https://auth.test", "aud"),
    ).rejects.toThrow("Signature mismatch with data payload");
  });

  it("verifies against the configured server and audience", async () => {
    verifySignedAuthResponseMock.mockResolvedValue({ sub: "user-1" });

    await verifyUpstreamSession(SESSION, "https://auth.test", "the-audience");

    expect(verifySignedAuthResponseMock).toHaveBeenCalledWith(
      "access-token",
      "https://auth.test",
      "the-audience",
    );
  });
});

describe("issueSessionCookies", () => {
  it("builds the access and refresh cookies", async () => {
    verifySignedAuthResponseMock.mockResolvedValue({
      sub: "user-1",
      sid: "s-1",
    });

    expect(await issueSessionCookies(SESSION, OPTIONS)).toEqual([
      {
        name: "seamless-access",
        value: {
          sub: "user-1",
          sessionId: "s-1",
          token: "access-token",
          roles: ["admin"],
          email: "user@acme.test",
          phone: null,
          organizationId: "org-1",
        },
        ttl: 300,
        domain: "acme.test",
      },
      {
        name: "seamless-refresh",
        value: { sub: "user-1", refreshToken: "refresh-token" },
        ttl: 3600,
        domain: "acme.test",
      },
    ]);
  });

  it("omits the session id key entirely when there is no sid", async () => {
    verifySignedAuthResponseMock.mockResolvedValue({ sub: "user-1" });

    const [access] = await issueSessionCookies(SESSION, OPTIONS);

    expect(access.value).not.toHaveProperty("sessionId");
  });

  // The refresh path writes `organizationId: null` on every reissue, so a
  // session that omitted it disagreed with itself after one refresh.
  it("always carries an organization id, null when there is none", async () => {
    verifySignedAuthResponseMock.mockResolvedValue({ sub: "user-1" });

    const [access] = await issueSessionCookies(
      { ...SESSION, organizationId: undefined },
      OPTIONS,
    );

    expect(access.value.organizationId).toBeNull();
  });

  it("issues only the access cookie when no refresh cookie is named", async () => {
    verifySignedAuthResponseMock.mockResolvedValue({ sub: "user-1" });

    const cookies = await issueSessionCookies(SESSION, {
      ...OPTIONS,
      refreshCookieName: undefined,
    });

    expect(cookies).toHaveLength(1);
    expect(cookies[0].name).toBe("seamless-access");
  });

  it("does not build cookies from a response it could not verify", async () => {
    verifySignedAuthResponseMock.mockResolvedValue(null);

    await expect(issueSessionCookies(SESSION, OPTIONS)).rejects.toThrow(
      "Invalid signed response from Auth Server",
    );
  });
});
