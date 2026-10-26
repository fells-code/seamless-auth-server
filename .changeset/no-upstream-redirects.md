---
"@seamless-auth/core": patch
"@seamless-auth/express": patch
"@seamless-auth/fastify": patch
"@seamless-auth/nextjs": patch
---

Do not follow redirects on upstream requests. `authFetch` now sends every auth API request with
`redirect: "manual"` and answers a 3xx as a 502 with `{ "error": "upstream_redirect" }`, so a
misconfigured proxy in front of the API can no longer get the service token and forwarded client
headers resent to another origin. The adapter manifest fetch no longer follows redirects either,
and falls back to the bundled copy instead.
