export interface AuthServerIssuerOption {
  /**
   * The `iss` the auth server signs into its access tokens and signed
   * responses. Defaults to `authServerUrl`.
   *
   * Set it when this application reaches the auth server at a different URL
   * from the one the server advertises as its issuer (its `ISSUER` setting).
   * For example, an application run on the host against the local Docker
   * stack calls `http://localhost:5312`, while the auth server signs as
   * `http://auth:5312`. Requests and key set fetches still go to
   * `authServerUrl`; only the `iss` check reads this. The auth API also sets
   * `aud` to its ISSUER, so the `audience` passed alongside should normally
   * be the same value.
   */
  authServerIssuer?: string;
}

// An empty issuer falls back too: jose skips the `iss` check for an empty
// expected value, which would accept a token from any issuer.
export function resolveAuthServerIssuer(
  authServerUrl: string,
  authServerIssuer: string | undefined,
): string {
  return authServerIssuer || authServerUrl;
}
