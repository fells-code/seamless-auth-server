---
"@seamless-auth/core": patch
"@seamless-auth/express": patch
"@seamless-auth/fastify": patch
"@seamless-auth/nextjs": patch
---

Mark client credentials tokens on the resource server user (#260). A user verified by `createResourceServer` now carries `isClient`, `true` when `sub` equals `client_id` (a machine acting for itself, whose `id` is a client id rather than a user id) and `false` otherwise. Code that builds a `ResourceServerUser` by hand, such as a test double, needs the new field.
