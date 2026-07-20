---
"@seamless-auth/core": minor
"@seamless-auth/express": minor
---

Send a genuine machine-to-machine service token on proxied routes, and derive the forwarded client IP from a trusted hop.

`authFetch` no longer falls back to `authorization` when no `serviceAuthorization` is given, so the browser user's access token is never placed in the `x-seamless-service-token` header. The user's identity now travels in `Authorization` only. `serviceAuthorization` is accepted by every core handler that already accepted `forwardedClientIp`.

The Express adapter mints a real HS256 service token for proxied routes, signed with the configured `serviceSecret` and carrying the fixed `iss`/`aud` the auth server requires. The auth server only honors `x-seamless-client-ip` when a valid service token accompanies it, so client IP forwarding previously no-opped: IP-keyed rate limiters and audit records attributed proxied requests to the adapter's egress IP instead of the end user's. Tokens are reused for 45 seconds rather than signed per request.

The forwarded client IP is now validated as a real IP address, and is dropped when Express `trust proxy` is set to blanket `true`, since `req.ip` is then taken from a client-supplied `X-Forwarded-For`. Set `trust proxy` to an explicit hop count or subnet. A new `resolveClientIp` option lets adopters derive the address themselves when their topology needs it.
