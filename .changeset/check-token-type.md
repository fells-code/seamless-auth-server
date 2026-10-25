---
"@seamless-auth/core": patch
"@seamless-auth/express": patch
"@seamless-auth/fastify": patch
"@seamless-auth/nextjs": patch
---

Check the token type before trusting a token. `ensureCookies` now refuses an access cookie whose
inner token is not an access token (`typ: "access"`), as `requireAuth` already did, so a signed
pre-auth cookie copied into the access slot is answered 401. `verifyUpstreamSession` refuses a
response whose token has the wrong `typ`: an access token for session flows, and an ephemeral
token for `/login` and the manifest's pre-auth and registration routes (new optional
`expectedType` argument). Core also exports `holdsAccessToken`.
