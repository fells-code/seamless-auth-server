---
'@seamless-auth/core': patch
'@seamless-auth/express': patch
'@seamless-auth/fastify': patch
---

Normalize a cookie lifetime arriving from upstream, so the two adapters cannot disagree about it.

Registration failed on Fastify with `TypeError: option maxAge is invalid: 300`. The auth API returns
`ttl` as the string `"300"` on its registration response. Handler results declare `ttl` as a number
but fill it from a parsed JSON body, so nothing caught the mismatch.

From there the adapters diverged. Express multiplies the value into milliseconds, which coerces the
string to a number and hides the problem, so it has always worked. Fastify passes the value through
to `cookie`, whose `Number.isInteger` check rejects a string and throws, failing the request.

`applyCookies` now parses the lifetime once, before it reaches an adapter, and uses the parsed value
for the `Max-Age`, the `Expires`, and the signed cookie's own expiry. Anything that is not a positive
whole number of seconds throws with the offending value, rather than issuing a session cookie with a
lifetime nobody can vouch for.

The parity suite hand-wrote `ttl` as a number in every scenario, so it agreed on input the real
upstream does not send. It now covers a string `ttl` through the registration route.
