// A stand-in auth API for guard tests: it signs access tokens and serves the
// JWKS that verifies them, since every first-party guard now checks the token
// inside a session cookie against the auth API's key set.
import { exportJWK, generateKeyPair, SignJWT } from "jose";

const { privateKey, publicKey } = await generateKeyPair("RS256");
const jwk = {
  ...(await exportJWK(publicKey)),
  alg: "RS256",
  kid: "k1",
  use: "sig",
};

let serverCount = 0;

/**
 * A fresh auth server URL, so no JWKS cached by an earlier test is reused.
 * `fetch(next)` answers the JWKS request and hands any other to `next`.
 */
export function testAuthServer(name = "auth") {
  serverCount += 1;
  const url = `https://${name}-${serverCount}.example.com`;

  return {
    url,
    guardOptions: { authServerUrl: url, audience: url },
    accessToken(claims = {}, { issuer = url } = {}) {
      return new SignJWT({ sub: "user-1", typ: "access", roles: [], ...claims })
        .setProtectedHeader({ alg: "RS256", kid: "k1" })
        .setIssuer(issuer)
        .setAudience(issuer)
        .setIssuedAt()
        .setExpirationTime("5m")
        .sign(privateKey);
    },
    fetch(next) {
      return async (input, init) => {
        if (input.toString() === `${url}/.well-known/jwks.json`) {
          return new Response(JSON.stringify({ keys: [jwk] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (next) return next(input, init);
        throw new Error(`Unexpected fetch URL: ${input}`);
      };
    },
  };
}
