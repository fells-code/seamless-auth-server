import { jest } from "@jest/globals";
import jwt from "jsonwebtoken";

// An auth API access token as the cookie carries it. The guard reads its type,
// so a placeholder string would not pass for a session.
const INNER = jwt.sign({ sub: "user-1", typ: "access" }, "upstream-signing-key");

const { getSeamlessClaims, getSeamlessSession, hasSeamlessSession } =
  await import("../dist/index.js");

const COOKIE_SECRET = "cookie-secret-cookie-secret-cookie-secret";
const SERVICE_SECRET = "service-secret-service-secret-service-secret";

const OPTIONS = {
  authServerUrl: "https://auth.example.com",
  cookieSecret: COOKIE_SECRET,
  serviceSecret: SERVICE_SECRET,
  jwksKid: "test-main",
};

const signed = (payload, ttl = "300s", secret = COOKIE_SECRET) =>
  jwt.sign(payload, secret, { algorithm: "HS256", expiresIn: ttl });

const ACCESS = {
  sub: "user-123",
  token: INNER,
  roles: ["admin"],
  email: "user@example.com",
};

/** The shape of `await cookies()` and `request.cookies`. */
function jar(values) {
  return {
    get: (name) =>
      values[name] === undefined ? undefined : { name, value: values[name] },
  };
}

const ME = {
  user: { id: "user-123", email: "user@example.com", phone: null, roles: [] },
  credentials: [{ id: "cred-1" }],
  organizations: [],
  activeOrganization: null,
};

function upstream(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

describe("session helpers", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn(async () => upstream(200, ME));
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe("getSeamlessSession", () => {
    it("asks the auth API directly with the token inside the access cookie", async () => {
      const session = await getSeamlessSession(
        jar({ "seamless-access": signed(ACCESS) }),
        { ...OPTIONS, userAgent: "Mozilla/5.0 (test)" },
      );

      expect(session).toEqual(ME);
      const [url, init] = global.fetch.mock.calls[0];
      expect(url).toBe("https://auth.example.com/users/me");
      expect(init.headers.Authorization).toBe(`Bearer ${INNER}`);
      expect(init.headers["x-seamless-service-token"]).toMatch(/^Bearer /);
      expect(init.headers["x-seamless-client-user-agent"]).toBe(
        "Mozilla/5.0 (test)",
      );
    });

    it("works without a serviceSecret, sending no service token", async () => {
      const { serviceSecret: _unused, ...withoutService } = OPTIONS;

      await getSeamlessSession(
        jar({ "seamless-access": signed(ACCESS) }),
        withoutService,
      );

      expect(
        global.fetch.mock.calls[0][1].headers["x-seamless-service-token"],
      ).toBeUndefined();
    });

    it("defaults credentials to an empty list", async () => {
      global.fetch = jest.fn(async () => upstream(200, { user: ME.user }));

      const session = await getSeamlessSession(
        jar({ "seamless-access": signed(ACCESS) }),
        OPTIONS,
      );

      expect(session.credentials).toEqual([]);
    });

    it.each([
      ["no cookie", {}],
      ["an expired access cookie", { "seamless-access": signed(ACCESS, "-1s") }],
      [
        "a cookie signed with another secret",
        {
          "seamless-access": signed(
            ACCESS,
            "300s",
            "another-secret-another-secret-another",
          ),
        },
      ],
      [
        "a cookie with no upstream token",
        { "seamless-access": signed({ sub: "user-123" }) },
      ],
    ])("resolves to null with %s, asking upstream nothing", async (_label, values) => {
      expect(await getSeamlessSession(jar(values), OPTIONS)).toBeNull();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    // The point of the helper. A refresh from the server would rotate the
    // refresh token in a response the browser never sees.
    it("never refreshes, even with a valid refresh cookie", async () => {
      const session = await getSeamlessSession(
        jar({
          "seamless-access": signed(ACCESS, "-1s"),
          "seamless-refresh": signed(
            { sub: "user-123", refreshToken: "opaque" },
            "3600s",
          ),
        }),
        OPTIONS,
      );

      expect(session).toBeNull();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("resolves to null when the auth API refuses the token", async () => {
      global.fetch = jest.fn(async () => upstream(401, { error: "unauthorized" }));

      expect(
        await getSeamlessSession(
          jar({ "seamless-access": signed(ACCESS) }),
          OPTIONS,
        ),
      ).toBeNull();
    });

    it("reads a custom access cookie name", async () => {
      await getSeamlessSession(jar({ "app-access": signed(ACCESS) }), {
        ...OPTIONS,
        accessCookieName: "app-access",
      });

      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it("refuses a weak cookie secret", async () => {
      await expect(
        getSeamlessSession(jar({}), { ...OPTIONS, cookieSecret: "short" }),
      ).rejects.toThrow();
    });
  });

  describe("getSeamlessClaims", () => {
    it("reads the access cookie locally, without the upstream token", () => {
      const claims = getSeamlessClaims(
        jar({ "seamless-access": signed(ACCESS) }),
        OPTIONS,
      );

      expect(claims).toMatchObject({
        id: "user-123",
        roles: ["admin"],
        email: "user@example.com",
      });
      expect(claims).not.toHaveProperty("token");
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("resolves to null for an expired cookie", () => {
      expect(
        getSeamlessClaims(
          jar({ "seamless-access": signed(ACCESS, "-1s") }),
          OPTIONS,
        ),
      ).toBeNull();
    });
  });

  it("getSeamlessClaims refuses a pre-auth cookie presented as the session", () => {
    const ephemeral = jwt.sign({ sub: "user-123", typ: "ephemeral" }, "upstream-signing-key");

    expect(
      getSeamlessClaims(
        jar({ "seamless-access": signed({ sub: "user-123", token: ephemeral }) }),
        OPTIONS,
      ),
    ).toBeNull();
  });

  describe("hasSeamlessSession", () => {
    const refresh = (ttl = "3600s") =>
      signed({ sub: "user-123", refreshToken: "opaque" }, ttl);

    it.each([
      ["a valid access cookie", { "seamless-access": signed(ACCESS) }, true],
      [
        "an expired access cookie with a valid refresh cookie",
        {
          "seamless-access": signed(ACCESS, "-1s"),
          "seamless-refresh": refresh(),
        },
        true,
      ],
      ["only a valid refresh cookie", { "seamless-refresh": refresh() }, true],
      ["an expired refresh cookie", { "seamless-refresh": refresh("-1s") }, false],
      ["no cookies", {}, false],
      [
        "a tampered refresh cookie",
        { "seamless-refresh": `${refresh()}x` },
        false,
      ],
    ])("with %s", (_label, values, expected) => {
      expect(hasSeamlessSession(jar(values), OPTIONS)).toBe(expected);
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });
});
