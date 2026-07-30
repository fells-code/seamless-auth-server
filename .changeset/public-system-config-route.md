---
'@seamless-auth/core': minor
'@seamless-auth/express': minor
'@seamless-auth/fastify': minor
---

Proxy the public system configuration at `GET /system-config/public`.

Both adapters serve routes from an explicit list, so a new upstream route is not reachable until it
is added here. This one returns the configured `loginMethods` to a signed-out caller, which is what
lets the bundled sign-in screens offer the methods an instance actually has enabled instead of a
hardcoded guess, and lets them tell whether declining a passkey during registration would leave a
user with no way back in.

`getPublicSystemConfigHandler` forwards no identity: no authorization header and no service token,
matching how the upstream route is served and how `GET /oauth/providers` already behaves here. A
signed-out browser is the expected caller, so attaching a session would only put a stale cookie in
the path of the one call that client has to make.

Requires the `GET /system-config/public` route on the auth API.
