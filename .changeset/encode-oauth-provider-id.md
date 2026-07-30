---
"@seamless-auth/express": patch
---

Encode the provider id on the OAuth provider admin routes before forwarding it upstream.

`PATCH` and `DELETE /system-config/oauth-providers/:id` interpolated `req.params.id` straight into the upstream URL. Every other proxied route param goes through `encodeURIComponent`, and these two were missed when that pass landed. A param carrying `?`, `#`, or an encoded `/` was decoded into the URL raw, so it could append or override upstream query parameters or reshape the upstream path.

An id of `abc?admin=1` was forwarded as `/system-config/oauth-providers/abc?admin=1`, turning attacker-controlled input into an upstream query parameter. It is now forwarded as a single encoded path segment, which upstream rejects as an unknown id.

The routes require an authenticated access session, so this is not reachable anonymously.
