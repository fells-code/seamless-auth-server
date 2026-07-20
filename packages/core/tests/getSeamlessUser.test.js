import { jest } from "@jest/globals";
import jwt from "jsonwebtoken";

const COOKIE_SECRET = "cookie-secret-cookie-secret-cookie-secret";
const USER = {
  id: "user-1",
  email: "user@example.com",
  phone: null,
  roles: ["user"],
  lastLogin: "2026-01-01T00:00:00.000Z",
  activeOrganizationId: null,
};

function createAccessCookie(secret = COOKIE_SECRET) {
  return jwt.sign({ sub: "user-1", token: "user-access-token" }, secret, {
    algorithm: "HS256",
    expiresIn: "300s",
  });
}

function baseOptions() {
  return {
    authServerUrl: "https://auth.example.com",
    cookieSecret: COOKIE_SECRET,
    authorization: "Bearer user-access-token",
    serviceAuthorization: "Bearer service-token",
    forwardedClientIp: "203.0.113.44",
  };
}

function lastInit() {
  return global.fetch.mock.calls[0][1];
}

describe("getSeamlessUser", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ user: USER }),
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("forwards the service token alongside the client IP", async () => {
    const { getSeamlessUser } = await import("../dist/getSeamlessUser.js");

    await getSeamlessUser(
      { "seamless-access": createAccessCookie() },
      baseOptions(),
    );

    // The auth API drops x-seamless-client-ip unless the service token rides with
    // it, so neither header is useful on its own.
    expect(global.fetch).toHaveBeenCalledWith(
      "https://auth.example.com/users/me",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer user-access-token",
          "x-seamless-service-token": "Bearer service-token",
          "x-seamless-client-ip": "203.0.113.44",
        }),
      }),
    );
  });

  it("returns the canonical user from the response body", async () => {
    const { getSeamlessUser } = await import("../dist/getSeamlessUser.js");

    const user = await getSeamlessUser(
      { "seamless-access": createAccessCookie() },
      baseOptions(),
    );

    expect(user).toEqual(USER);
  });

  it("reads a custom cookie name", async () => {
    const { getSeamlessUser } = await import("../dist/getSeamlessUser.js");

    const user = await getSeamlessUser(
      { "custom-access": createAccessCookie() },
      { ...baseOptions(), cookieName: "custom-access" },
    );

    expect(user).toEqual(USER);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("omits the service token header when none is supplied", async () => {
    const { getSeamlessUser } = await import("../dist/getSeamlessUser.js");

    const opts = baseOptions();
    delete opts.serviceAuthorization;

    await getSeamlessUser({ "seamless-access": createAccessCookie() }, opts);

    expect(lastInit().headers).not.toHaveProperty("x-seamless-service-token");
  });

  it("returns null without calling the auth server when the cookie is missing", async () => {
    const { getSeamlessUser } = await import("../dist/getSeamlessUser.js");

    await expect(getSeamlessUser({}, baseOptions())).resolves.toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("returns null without calling the auth server when the cookie is signed by another secret", async () => {
    const { getSeamlessUser } = await import("../dist/getSeamlessUser.js");

    const forged = createAccessCookie("attacker-secret-attacker-secret-attacker");

    await expect(
      getSeamlessUser({ "seamless-access": forged }, baseOptions()),
    ).resolves.toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("returns null when the auth server rejects the token", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ error: "Unauthorized" }),
    });

    const { getSeamlessUser } = await import("../dist/getSeamlessUser.js");

    await expect(
      getSeamlessUser({ "seamless-access": createAccessCookie() }, baseOptions()),
    ).resolves.toBeNull();
  });

  it("rejects a weak cookie secret", async () => {
    const { getSeamlessUser } = await import("../dist/getSeamlessUser.js");

    await expect(
      getSeamlessUser(
        { "seamless-access": createAccessCookie() },
        { ...baseOptions(), cookieSecret: "short" },
      ),
    ).rejects.toThrow();
  });
});
