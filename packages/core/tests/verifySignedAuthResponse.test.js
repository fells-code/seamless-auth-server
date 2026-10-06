import { jest } from "@jest/globals";
import { exportJWK, generateKeyPair, SignJWT } from "jose";

const { setSeamlessLogger } = await import("../dist/logger.js");

const AUTH_SERVER_URL = "https://auth.example.com";

async function createSignedToken(audience, subject = "user-123") {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const jwk = await exportJWK(publicKey);
  jwk.alg = "RS256";
  jwk.kid = "test-key";
  jwk.use = "sig";

  const token = await new SignJWT({ sub: subject })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer(AUTH_SERVER_URL)
    .setAudience(audience)
    .setSubject(subject)
    .setExpirationTime("5m")
    .sign(privateKey);

  return { token, jwk };
}

function mockJwks(jwk) {
  global.fetch = jest.fn(async (url) => {
    if (url.toString() === `${AUTH_SERVER_URL}/.well-known/jwks.json`) {
      return new Response(JSON.stringify({ keys: [jwk] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  });
}

describe("verifySignedAuthResponse", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("returns the payload when the audience matches", async () => {
    const { token, jwk } = await createSignedToken("app-a");
    mockJwks(jwk);

    const { verifySignedAuthResponse } = await import(
      "../dist/verifySignedAuthResponse.js"
    );

    const payload = await verifySignedAuthResponse(
      token,
      AUTH_SERVER_URL,
      "app-a",
    );

    expect(payload).not.toBeNull();
    expect(payload.sub).toBe("user-123");
    expect(payload.aud).toBe("app-a");
  });

  it("returns null when the audience does not match", async () => {
    const { token, jwk } = await createSignedToken("app-a");
    mockJwks(jwk);

    const { verifySignedAuthResponse } = await import(
      "../dist/verifySignedAuthResponse.js"
    );

    const payload = await verifySignedAuthResponse(
      token,
      AUTH_SERVER_URL,
      "app-b",
    );

    expect(payload).toBeNull();
  });

  describe("when the auth server changes its key under the same kid", () => {
    let serverCount = 0;
    let now;
    let logged;

    beforeEach(() => {
      now = Date.now();
      jest.spyOn(Date, "now").mockImplementation(() => now);
      logged = [];
      setSeamlessLogger({ warn: () => {}, error: (m) => logged.push(m) });
    });

    afterEach(() => {
      jest.restoreAllMocks();
      setSeamlessLogger();
    });

    // A distinct auth server URL per test, since the key set is memoized per URL.
    function nextServer() {
      serverCount += 1;
      return `https://auth-rotate-${serverCount}.example.com`;
    }

    async function keyPair() {
      const { privateKey, publicKey } = await generateKeyPair("RS256");
      const jwk = {
        ...(await exportJWK(publicKey)),
        alg: "RS256",
        kid: "dev-main",
        use: "sig",
      };
      return { privateKey, jwk };
    }

    function sign(authServerUrl, privateKey) {
      return new SignJWT({ sub: "user-123" })
        .setProtectedHeader({ alg: "RS256", kid: "dev-main" })
        .setIssuer(authServerUrl)
        .setAudience("app-a")
        .setExpirationTime("5m")
        .sign(privateKey);
    }

    function serve(authServerUrl, keys) {
      global.fetch = jest.fn(async (url) => {
        if (url.toString() === `${authServerUrl}/.well-known/jwks.json`) {
          return new Response(JSON.stringify({ keys: [keys.current] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        throw new Error(`Unexpected fetch URL: ${url}`);
      });
    }

    it("refetches the key set once and verifies with the new key", async () => {
      const { verifySignedAuthResponse } = await import(
        "../dist/verifySignedAuthResponse.js"
      );
      const authServerUrl = nextServer();
      const oldKey = await keyPair();
      const newKey = await keyPair();
      const keys = { current: oldKey.jwk };
      serve(authServerUrl, keys);

      const first = await verifySignedAuthResponse(
        await sign(authServerUrl, oldKey.privateKey),
        authServerUrl,
        "app-a",
      );
      expect(first).not.toBeNull();

      keys.current = newKey.jwk;
      now += 31_000;

      const second = await verifySignedAuthResponse(
        await sign(authServerUrl, newKey.privateKey),
        authServerUrl,
        "app-a",
      );

      expect(second).not.toBeNull();
      expect(second.sub).toBe("user-123");
      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(logged).toEqual([]);
    });

    it("does not refetch within the cooldown, and logs the reason", async () => {
      const { verifySignedAuthResponse } = await import(
        "../dist/verifySignedAuthResponse.js"
      );
      const authServerUrl = nextServer();
      const oldKey = await keyPair();
      const newKey = await keyPair();
      const keys = { current: oldKey.jwk };
      serve(authServerUrl, keys);

      await verifySignedAuthResponse(
        await sign(authServerUrl, oldKey.privateKey),
        authServerUrl,
        "app-a",
      );
      keys.current = newKey.jwk;

      const payload = await verifySignedAuthResponse(
        await sign(authServerUrl, newKey.privateKey),
        authServerUrl,
        "app-a",
      );

      expect(payload).toBeNull();
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(logged).toEqual([
        "[SeamlessAuth] Failed to verify signed auth response (ERR_JWS_SIGNATURE_VERIFICATION_FAILED).",
      ]);
    });

    it("fails once when the refetched key set still does not match", async () => {
      const { verifySignedAuthResponse } = await import(
        "../dist/verifySignedAuthResponse.js"
      );
      const authServerUrl = nextServer();
      const servedKey = await keyPair();
      const forgedKey = await keyPair();
      serve(authServerUrl, { current: servedKey.jwk });

      await verifySignedAuthResponse(
        await sign(authServerUrl, servedKey.privateKey),
        authServerUrl,
        "app-a",
      );
      now += 31_000;

      const payload = await verifySignedAuthResponse(
        await sign(authServerUrl, forgedKey.privateKey),
        authServerUrl,
        "app-a",
      );

      expect(payload).toBeNull();
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });
});
