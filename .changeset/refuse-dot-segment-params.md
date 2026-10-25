---
"@seamless-auth/core": patch
"@seamless-auth/express": patch
"@seamless-auth/fastify": patch
"@seamless-auth/nextjs": patch
---

Refuse empty, `.` and `..` route params on the hand-written passthroughs and core handlers with
a 400 `bad_request`, as the manifest proxy already did. A decoded `%2e%2e` param previously stayed
literal after encoding and moved the upstream path. Core exports `encodePathParam` and
`InvalidPathParamError` for the shared rule.
