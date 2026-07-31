# @seamless-auth/fastify

## 0.3.1

### Patch Changes

- 62da4c2: Normalize a cookie lifetime arriving from upstream, so the two adapters cannot disagree about it.

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

- Updated dependencies [62da4c2]
  - @seamless-auth/core@0.12.1

## 0.3.0

### Minor Changes

- 56438fc: Proxy the public system configuration at `GET /system-config/public`.

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

### Patch Changes

- Updated dependencies [56438fc]
  - @seamless-auth/core@0.12.0

## 0.2.0

### Minor Changes

- 39d71a2: Serve the Seamless admin console from a Fastify API, matching the Express adapter's `createSeamlessConsoleProxy`.

  `seamlessConsoleProxy` is a plugin you register under a prefix, the same shape as `seamlessAuth`, so the mount path comes from Fastify rather than from the options. The Express adapter mounts a router and takes its upstream subtree from `basePath`; here `basePath` only says what to request upstream, and it still defaults to `/console`.

  It proxies `GET` and `HEAD` with `fetch`, forwards nothing from the incoming request but the method and the path, and copies back `content-type`, `cache-control`, `etag`, and `last-modified`. Unknown paths under the prefix go upstream too, which is how deep links into the dashboard get the SPA shell. A path that resolves outside the console subtree, or that carries an encoded path separator, is refused with a 400 and never reaches the upstream.

  The two adapters resolve the upstream URL from the raw request path for the same reason but by different routes: Express normalizes dot-segments before routing, and Fastify percent-decodes wildcard params, so this reads `request.url` instead of `request.params` to keep the traversal check looking at what the client actually sent.

  The parity suite now runs the console proxy through both adapters and asserts the status, body, caching headers, and upstream URL match.

  New exports: `seamlessConsoleProxy`, `SeamlessConsoleProxyOptions`.

## 0.1.0

### Minor Changes

- f032a64: Add `@seamless-auth/fastify`, a Fastify adapter serving the same routes as the Express adapter.

  Register it under a prefix and it serves the auth flows, the passthrough proxy routes, and the admin, session, metrics, and system-config routes, managing the session cookies they depend on. `requireAuth` and `requireRole` are exported as `preHandler` hooks for an adopter's own routes, alongside `getSeamlessUser`.

  Both adapters emit identical responses. A parity suite runs the same requests through each against the same mocked auth API and asserts the status, body, and every `Set-Cookie` header match, so the two cannot drift.

  `createSeamlessConsoleProxy` has no Fastify equivalent yet. It proxies the admin console's static assets and is separate from the auth routes.

### Patch Changes

- Updated dependencies [f032a64]
- Updated dependencies [c52b5d1]
- Updated dependencies [519a1b0]
- Updated dependencies [3c5c1c5]
- Updated dependencies [d17896b]
- Updated dependencies [9735f83]
- Updated dependencies [9e04625]
- Updated dependencies [82fc15a]
- Updated dependencies [d7d408d]
- Updated dependencies [744418b]
- Updated dependencies [17c5487]
- Updated dependencies [583271a]
- Updated dependencies [a5e3070]
- Updated dependencies [8e03099]
  - @seamless-auth/core@0.11.0
