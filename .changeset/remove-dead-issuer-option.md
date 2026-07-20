---
"@seamless-auth/express": minor
---

**Breaking:** remove the `issuer` option from `SeamlessAuthServerOptions`. Delete the `issuer` line from your `createSeamlessAuthServer(...)` call; no other change is needed.

The option was required but write-only. Since the silent-refresh path moved to the fixed M2M contract constants (`iss: seamless-portal-api`, `aud: seamless-auth`), the adopter-supplied value reached nothing, so removing it changes no runtime behavior. `audience` is unaffected and stays required: it is enforced when verifying signed auth-server responses.

The adapter README also documents a deployment constraint that produced an opaque failure: `authServerUrl` must exactly match the auth server's `ISSUER` environment variable, because signed responses are verified with `iss === authServerUrl`. Pointing the adapter at an internal address while the auth server issues its public URL fails every login with only a generic verification error.
