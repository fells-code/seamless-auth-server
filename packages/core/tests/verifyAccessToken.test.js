import { jest } from "@jest/globals";
import { exportJWK, generateKeyPair, SignJWT } from "jose";

const { extractBearerToken, verifyAccessToken } = await import(
  "../dist/verifyAccessToken.js"
);

// One key pair per suite, and a distinct auth server URL per test. The JWKS
// instance is memoised per URL and caches keys by kid, so reusing a URL with a
// different key would verify against the stale one.
const { privateKey, publicKey } = await generateKeyPair("RS256");
const jwk = { ...(await exportJWK(publicKey)), alg: "RS256", kid: "k1", use: "sig" };

let serverCount = 0;
function nextServer() {
  serverCount += 1;
  return `https://auth-${serverCount}.example.com`;
}

function mockJwks(authServerUrl) {
  global.fetch = jest.fn(async (url) => {
    if (url.toString() === `${authServerUrl}/.well-known/jwks.json`) {
      return new Response(JSON.stringify({ keys: [jwk] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    throw new Error(`Unexpected fetch URL: ${url}`);
  });
}

async function sign(
  authServerUrl,
  claims,
  { audience = authServerUrl, issuer = authServerUrl } = {},
) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);
}

const ACCESS_CLAIMS = {
  sub: "user-123",
  typ: "access",
  sid: "session-1",
  roles: ["athlete"],
};

describe("extractBearerToken", () => {
  it.each([
    ["Bearer abc.def.ghi", "abc.def.ghi"],
    ["bearer abc", "abc"],
    ["  Bearer   abc  ", "abc"],
  ])("reads %p", (header, expected) => {
    expect(extractBearerToken(header)).toBe(expected);
  });

  it.each([
    [undefined],
    [""],
    ["Bearer"],
    ["Bearer "],
    ["Basic abc"],
    ["Bearer a b"],
  ])("rejects %p", (header) => {
    expect(extractBearerToken(header)).toBeUndefined();
  });
});

describe("verifyAccessToken", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("returns the claims of an access token for the configured audience", async () => {
    const server = nextServer();
    mockJwks(server);

    const claims = await verifyAccessToken(
      await sign(server, ACCESS_CLAIMS),
      server,
      server,
    );

    expect(claims).toMatchObject(ACCESS_CLAIMS);
  });

  it("rejects an ephemeral token even though it is signed by the same key", async () => {
    const server = nextServer();
    mockJwks(server);

    const claims = await verifyAccessToken(
      await sign(server, { ...ACCESS_CLAIMS, typ: "ephemeral" }),
      server,
      server,
    );

    expect(claims).toBeNull();
  });

  it("rejects a token with no typ", async () => {
    const server = nextServer();
    mockJwks(server);

    const { typ: _typ, ...untyped } = ACCESS_CLAIMS;
    const claims = await verifyAccessToken(
      await sign(server, untyped),
      server,
      server,
    );

    expect(claims).toBeNull();
  });

  it("rejects a token for another audience", async () => {
    const server = nextServer();
    mockJwks(server);

    const claims = await verifyAccessToken(
      await sign(server, ACCESS_CLAIMS, { audience: "https://other.example.com" }),
      server,
      server,
    );

    expect(claims).toBeNull();
  });

  it("rejects a token from another issuer", async () => {
    const server = nextServer();
    const otherIssuer = nextServer();
    mockJwks(server);

    const claims = await verifyAccessToken(
      await sign(otherIssuer, ACCESS_CLAIMS, { audience: server }),
      server,
      server,
    );

    expect(claims).toBeNull();
  });

  it("rejects an empty issuer or audience instead of verifying loosely", async () => {
    const server = nextServer();
    mockJwks(server);
    const token = await sign(server, ACCESS_CLAIMS);

    await expect(verifyAccessToken(token, server, "")).resolves.toBeNull();
    await expect(verifyAccessToken(token, "", server)).resolves.toBeNull();
  });

  it("rejects garbage without touching the network", async () => {
    const server = nextServer();
    global.fetch = jest.fn();

    const claims = await verifyAccessToken("not-a-jwt", server, server);

    expect(claims).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("picks up a new key served under the same kid", async () => {
    const server = nextServer();
    mockJwks(server);
    await verifyAccessToken(await sign(server, ACCESS_CLAIMS), server, server);

    const rotated = await generateKeyPair("RS256");
    const rotatedJwk = {
      ...(await exportJWK(rotated.publicKey)),
      alg: "RS256",
      kid: "k1",
      use: "sig",
    };
    global.fetch = jest.fn(
      async () =>
        new Response(JSON.stringify({ keys: [rotatedJwk] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    const now = Date.now();
    jest.spyOn(Date, "now").mockReturnValue(now + 31_000);

    try {
      const token = await new SignJWT(ACCESS_CLAIMS)
        .setProtectedHeader({ alg: "RS256", kid: "k1" })
        .setIssuer(server)
        .setAudience(server)
        .setExpirationTime("5m")
        .sign(rotated.privateKey);

      const claims = await verifyAccessToken(token, server, server);

      expect(claims).toMatchObject(ACCESS_CLAIMS);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    } finally {
      jest.restoreAllMocks();
    }
  });

  describe("with a configured auth server issuer", () => {
    // fells-code/seamless-cli#224: the Docker stack's auth server signs as
    // http://auth:5312 while a host-run app reaches it at localhost.
    const ISSUER = "http://auth:5312";

    it("verifies a token from the configured issuer", async () => {
      const server = nextServer();
      mockJwks(server);

      const claims = await verifyAccessToken(
        await sign(server, ACCESS_CLAIMS, { issuer: ISSUER }),
        server,
        server,
        ISSUER,
      );

      expect(claims).toMatchObject(ACCESS_CLAIMS);
    });

    it("rejects a token signed under the URL once an issuer is configured", async () => {
      const server = nextServer();
      mockJwks(server);

      const claims = await verifyAccessToken(
        await sign(server, ACCESS_CLAIMS),
        server,
        server,
        ISSUER,
      );

      expect(claims).toBeNull();
    });

    it("rejects a token from a distinct issuer when none is configured", async () => {
      const server = nextServer();
      mockJwks(server);

      const claims = await verifyAccessToken(
        await sign(server, ACCESS_CLAIMS, { issuer: ISSUER }),
        server,
        server,
      );

      expect(claims).toBeNull();
    });

    it("falls back to the URL for an empty issuer rather than skipping the check", async () => {
      const server = nextServer();
      mockJwks(server);

      await expect(
        verifyAccessToken(await sign(server, ACCESS_CLAIMS), server, server, ""),
      ).resolves.toMatchObject(ACCESS_CLAIMS);
      await expect(
        verifyAccessToken(
          await sign(server, ACCESS_CLAIMS, { issuer: ISSUER }),
          server,
          server,
          "",
        ),
      ).resolves.toBeNull();
    });
  });
});
