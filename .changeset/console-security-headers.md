---
"@seamless-auth/express": patch
"@seamless-auth/fastify": patch
"@seamless-auth/nextjs": patch
---

Keep the API's framing and content-type headers on the console proxy. The proxy now forwards
`Content-Security-Policy`, `X-Frame-Options` and `X-Content-Type-Options` from the API, and when
the API sends neither of the last two it sets `X-Frame-Options: DENY` and
`X-Content-Type-Options: nosniff` (unless the application already set them), so the admin console
served on the app origin cannot be framed.
