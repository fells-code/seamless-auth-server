---
"@seamless-auth/core": minor
"@seamless-auth/express": minor
"@seamless-auth/fastify": minor
"@seamless-auth/nextjs": minor
---

Add `authServerIssuer`, the expected `iss` of the tokens and signed responses the auth server returns. It defaults to `authServerUrl`, so nothing changes unless you set it. Set it when the auth server is reached at a different URL from the issuer it advertises: on the local Docker stack the auth server signs as `http://auth:5312`, while an app run on the host calls `http://localhost:5312`, and every sign-in failed with `Invalid signed response from Auth Server` (fells-code/seamless-cli#224). Requests and key set fetches still go to `authServerUrl`; only the `iss` check reads the new option.

The auth API sets `aud` to its ISSUER as well, and `audience` stays required with no default, so with `authServerIssuer` set, set `audience` to the same value. For the Docker stack from the host that is `authServerUrl: "http://localhost:5312"`, `authServerIssuer: "http://auth:5312"`, `audience: "http://auth:5312"`. The option docs and READMEs now say this.

It is accepted by `createSeamlessAuthServer`, `requireAuth` and `getSeamlessUser` in Express, the `seamlessAuth` plugin, `requireAuth` and `getSeamlessUser` in Fastify, and `createSeamlessAuthHandler` and `getSeamlessSession` in Next.js. In core, `verifySignedAuthResponse`, `verifyAccessToken` and `verifyUpstreamSession` take it as an optional last argument, and `getSeamlessUser`, `authenticateBearer`, `authenticateRequest` (under `bearer`), `issueSessionCookies`, `sessionResult` and the session-issuing handlers' options take it as a field (`AuthServerIssuerOption`).

The startup warning for an unset or `dev-main` `jwksKid` now says what the value is: the `kid` header on the HS256 service tokens the adapter signs with `serviceSecret`, not the auth server's signing key. The READMEs describe `jwksKid` the same way.
