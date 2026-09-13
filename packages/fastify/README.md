# @seamless-auth/fastify

Fastify adapter for [Seamless Auth](https://seamlessauth.com) passwordless
authentication.

It serves the Seamless Auth routes from your own backend and manages the session
cookies they depend on, so the browser talks to your origin and never holds a
token itself. The decisions all live in `@seamless-auth/core`; this package binds
them to Fastify.

## Install

```sh
npm install @seamless-auth/fastify fastify
```

## Use

```ts
import Fastify from "fastify";
import seamlessAuth from "@seamless-auth/fastify";

const app = Fastify();

await app.register(seamlessAuth, {
  prefix: "/auth",
  authServerUrl: "https://identifier.seamlessauth.com",
  audience: "https://identifier.seamlessauth.com",
  cookieSecret: process.env.COOKIE_SECRET!,
  serviceSecret: process.env.SERVICE_SECRET!,
  jwksKid: "2024-09-main",
});

await app.listen({ port: 3000 });
```

Register it under a prefix. Fastify's encapsulation keeps the cookie and origin
hooks scoped to those routes, so the rest of your application is untouched.
`@fastify/cookie` is registered for you inside the plugin.

`cookieSecret` and `serviceSecret` must be at least 32 characters and the
`serviceSecret` must match the auth API's. Both are checked at registration, so a
weak secret fails at startup rather than on the first request.

## Guarding your own routes

`requireAuth` and `requireRole` are `preHandler` hooks and work anywhere, without
the plugin:

```ts
import { requireAuth, requireRole } from "@seamless-auth/fastify";

const authenticated = requireAuth({
  cookieSecret: process.env.COOKIE_SECRET!,
  authServerUrl: process.env.AUTH_SERVER_URL!,
  audience: process.env.AUTH_SERVER_URL!,
});

app.get("/api/me", { preHandler: authenticated }, async (req) => ({
  user: req.user,
}));

app.get(
  "/api/admin/reports",
  { preHandler: [authenticated, requireRole("admin:read")] },
  listReports,
);
```

`requireAuth` verifies the request's session and puts it on `request.user`. It
understands the signed access cookie the plugin issues to browsers, and, when
`authServerUrl` and `audience` are configured together, the auth API's own access
token in `Authorization: Bearer`, which is how a native client with no cookie jar
authenticates. A bearer token is verified against the auth API's JWKS, including
`typ: "access"`, so a sign-in flow's ephemeral token is refused. The cookie wins
when both are present. Leave the pair out and the guard accepts cookies only.

It does not refresh: silent refresh belongs to the plugin's own hook on the auth
routes, and a bearer client refreshes through `POST /auth/refresh` itself. Role
checks understand scoped names, so `admin` grants everything under it and
`admin:write` grants `admin:read`.

For the hydrated profile rather than the token payload, `getSeamlessUser(request, options)`
fetches it from the auth API and returns `SeamlessUser | null`. It resolves a cookie
session or a bearer access token, and returns `null` without calling the auth API when
the request carries neither or the token fails verification.

## Bearer transport for native clients

A native app has no cookie jar. When a request carries `x-seamless-auth-transport: bearer`
the same routes serve a bearer contract: the client presents the token a route needs in
`Authorization: Bearer` (the ephemeral token from `/login` on pre-auth routes, the access
token on access routes), session-issuing responses come back whole with `token` and
`refreshToken`, no `Set-Cookie` is written, and `POST /auth/refresh` rotates the session
from `Authorization: Bearer <refreshToken>`. Message delivery, client IP forwarding and the
service token behave as in cookie transport. Requests without the header are served exactly
as before. The Express README's "Bearer Transport for Native Clients" section walks through
a flow; the two adapters agree on every step, pinned by the parity suite.

## Adopter-supplied message delivery

Pass `messaging` to have the adapter deliver OTPs and magic links through your
own transports instead of the auth API sending them:

```ts
await app.register(seamlessAuth, {
  prefix: "/auth",
  // ...
  messaging: {
    email: myEmailTransport,
    defaults: { appName: "Acme", emailFrom: "no-reply@acme.test" },
  },
});
```

Delivery payloads carry one-time codes and links. They are stripped from the
response before it reaches the browser.

## Serving the admin console

`seamlessConsoleProxy` reverse-proxies the Seamless admin dashboard, so the
console loads from your own origin instead of a second one:

```ts
import seamlessAuth, { seamlessConsoleProxy } from "@seamless-auth/fastify";

await app.register(seamlessAuth, { prefix: "/auth", ...options });

await app.register(seamlessConsoleProxy, {
  prefix: "/console",
  authServerUrl: process.env.AUTH_SERVER_URL!,
});
```

Register it at the top-level `/console` prefix the dashboard is built against,
as a sibling of the auth prefix. The console then talks to the cookie-based
`/auth/*` endpoints on the same origin, with no cross-site request in the way.

Only `GET` and `HEAD` are proxied, and nothing from the incoming request is
forwarded but the method and the path: the console is public static hosting, and
the browser's session cookies have no business at the auth API. Requests that
resolve outside the console subtree are refused with a 400 and never reach the
upstream. `content-type`, `cache-control`, `etag`, and `last-modified` come back
from the upstream unchanged, so the dashboard's own caching still applies.

| Option | Default | Purpose |
| --- | --- | --- |
| `authServerUrl` | required | Base URL of your Seamless Auth instance |
| `basePath` | `/console` | Subtree requested upstream |

Unknown paths under the prefix are forwarded too, which is what makes deep links
into the dashboard work: the upstream answers them with the SPA shell.

## Options

| Option | Default | Purpose |
| --- | --- | --- |
| `authServerUrl` | required | Base URL of your Seamless Auth instance |
| `audience` | required | Audience your user tokens are issued for |
| `cookieSecret` | required | Signs the session cookies, 32 characters minimum |
| `serviceSecret` | required | Shared secret for machine-to-machine calls |
| `jwksKid` | `dev-main` | Active JWKS key id; set it explicitly before deploying |
| `cookieDomain` | none | Domain attribute for the auth cookies |
| `cookieSecure` | `true` | Set `false` only for local HTTP development |
| `cookieSameSite` | `none` when secure, else `lax` | SameSite policy |
| `allowedOrigins` | none | Origin allowlist for browsers without `Sec-Fetch-Site` |
| `accessCookieName` | `seamless-access` | Session cookie name |
| `registrationCookieName` | `seamless-ephemeral` | Registration cookie name |
| `refreshCookieName` | `seamless-refresh` | Refresh cookie name |
| `preAuthCookieName` | `seamless-ephemeral` | Login-initiation cookie name |
| `messaging` | none | Adopter-supplied delivery transports and overrides |
| `resolveClientIp` | none | Resolver for the end user's IP |

### Client IP

The adapter forwards the end user's IP so the auth API can rate limit and audit
against the real caller. With Fastify's `trustProxy` set to blanket `true`,
`request.ip` comes from the leftmost `X-Forwarded-For` entry, which any client
can set, so the adapter drops it and warns rather than forwarding a value the
caller chose. Set `trustProxy` to an explicit hop count or subnet, or pass
`resolveClientIp`.

The browser's `User-Agent` is forwarded alongside it as
`x-seamless-client-user-agent`, capped at 512 characters, so the auth API can
record the device a person signed in from rather than this adapter. It needs no
trust decision: it is self-reported by the browser either way.

## Relationship to `@seamless-auth/express`

Both adapters serve the same routes and issue the same cookies. A parity suite
runs the same requests through both against the same mocked auth API and asserts
the status, body, and every `Set-Cookie` header match, so the two cannot drift.
The console proxy is covered by the same suite.

The Express adapter exposes the console proxy as
`createSeamlessConsoleProxy(options)`, a router you mount. Here it is a plugin
you register under a prefix, so the mount path comes from Fastify rather than
from the options.

## License

AGPL-3.0-only. Copyright © Fells Code, LLC.
