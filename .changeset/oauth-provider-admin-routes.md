---
"@seamless-auth/core": patch
"@seamless-auth/express": patch
---

Proxy the new OAuth provider admin routes to the auth API: `GET`/`POST /system-config/oauth-providers` and `PATCH`/`DELETE /system-config/oauth-providers/:id`, all gated on the access identity. Register `/system-config/oauth-providers` in the core cookie requirements table so the ensureCookies middleware populates `req.cookiePayload` for both the collection and the id-scoped routes; without it the proxy never attaches the access token and the routes fail closed.
