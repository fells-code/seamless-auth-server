# @seamless-auth/nextjs

Next.js App Router adapter for [Seamless Auth](https://seamlessauth.com)
passwordless authentication.

It serves the Seamless Auth routes from a route handler in your Next.js
application and manages the session cookies they depend on, so the browser
talks to your origin and never holds a token itself. It also reads the session
in server components and `proxy.ts`. The decisions all live in
`@seamless-auth/core`; this package binds them to web-standard `Request` and
`Response`.

## Install

```sh
npm install @seamless-auth/nextjs @seamless-auth/react
```

## Serve the auth routes

Mount a catch-all route at `app/auth/[...seamless]/route.ts`:

```ts
import { createSeamlessAuthHandler } from "@seamless-auth/nextjs";

export const { GET, POST, PATCH, DELETE } = createSeamlessAuthHandler({
  authServerUrl: process.env.AUTH_SERVER_URL!,
  audience: process.env.AUTH_SERVER_URL!,
  cookieSecret: process.env.COOKIE_SECRET!,
  serviceSecret: process.env.SERVICE_SECRET!,
  jwksKid: process.env.JWKS_KID,
});
```

`/auth` is what the client SDKs call, so point `AuthProvider` at your own
origin:

```tsx
<AuthProvider apiHost={process.env.NEXT_PUBLIC_APP_URL!}>{children}</AuthProvider>
```

`cookieSecret` and `serviceSecret` must be at least 32 characters and the
`serviceSecret` must match the auth API's. Both are checked when the handler is
created, so a weak secret fails at startup rather than on the first request.

The adapter signs cookies with `jsonwebtoken`, so the route needs the Node.js
runtime. That is the default; do not set `export const runtime = "edge"`.

## Read the session in a server component

```tsx
// app/layout.tsx
import { cookies, headers } from "next/headers";
import { getSeamlessSession } from "@seamless-auth/nextjs";
import { AuthProvider } from "@seamless-auth/react";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSeamlessSession(await cookies(), {
    authServerUrl: process.env.AUTH_SERVER_URL!,
    cookieSecret: process.env.COOKIE_SECRET!,
    serviceSecret: process.env.SERVICE_SECRET!,
    jwksKid: process.env.JWKS_KID,
    userAgent: (await headers()).get("user-agent") ?? undefined,
  });

  return (
    <html lang="en">
      <body>
        <AuthProvider apiHost={process.env.NEXT_PUBLIC_APP_URL!} initialSession={session}>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
```

`getSeamlessSession` verifies the access cookie locally, asks the auth API for
`/users/me` with the token inside it, and returns the result in the shape
`AuthProvider` takes as `initialSession`. The first paint then renders the
signed-in user instead of a loading state.

It never refreshes. When the access cookie has expired it resolves to `null`,
even if the refresh cookie is still valid. A refresh here would rotate the
refresh token in a response the browser never receives, and the browser's own
next refresh would then be refused as a replay and revoke the session. The
React provider revalidates in the background after hydration, which renews the
session through the auth routes as usual.

For the same reason, do not call your own `/auth/users/me` from the server with
the browser's cookies forwarded.

## Protect routes in `proxy.ts`

```ts
// proxy.ts
import { NextResponse, type NextRequest } from "next/server";
import { hasSeamlessSession } from "@seamless-auth/nextjs";

export function proxy(request: NextRequest) {
  if (!hasSeamlessSession(request.cookies, { cookieSecret: process.env.COOKIE_SECRET! })) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
}

export const config = { matcher: ["/dashboard/:path*"] };
```

`hasSeamlessSession` checks the cookies locally, with no network call. A valid
refresh cookie counts as a session, because its access cookie may only have
expired and the next call to the auth routes renews it. Treating that as signed
out would send a returning user to the sign-in page once every access-token
lifetime.

`proxy.ts` is the Next.js 16 name and runs on the Node.js runtime. On Next.js
15, use `middleware.ts` with `export const config = { runtime: "nodejs" }`;
the Edge runtime cannot verify the cookies.

For a role check, `getSeamlessClaims` returns what the access cookie says about
the user, also locally:

```ts
import { getSeamlessClaims, hasScopedRole } from "@seamless-auth/nextjs";

const claims = getSeamlessClaims(request.cookies, { cookieSecret });
if (!claims || !hasScopedRole(claims.roles, "admin:read")) {
  return NextResponse.redirect(new URL("/", request.url));
}
```

The claims leave out the upstream access token, so they are safe to pass to a
client component. Treat them as a routing hint: the auth API stays the
authority on every call that matters.

## Bearer transport for native clients

A request carrying `x-seamless-auth-transport: bearer` is served without
cookies, exactly as in the other adapters: tokens travel in the response body
and `Authorization`, `ensureCookies` is skipped, and `POST /auth/refresh`
rotates the pair.

## Options

`createSeamlessAuthHandler` takes the same options as the Express and Fastify
adapters, plus `basePath`.

| Option | Default | Purpose |
| --- | --- | --- |
| `authServerUrl` | required | Base URL of your Seamless Auth instance |
| `audience` | required | Audience your user tokens are issued for |
| `cookieSecret` | required | Signs the session cookies, 32 characters minimum |
| `serviceSecret` | required | Shared secret for machine-to-machine calls |
| `jwksKid` | `dev-main` | Active JWKS key id; set it explicitly before deploying |
| `basePath` | `/auth` | Where the catch-all route is mounted |
| `cookieDomain` | none | Domain attribute for the auth cookies |
| `cookieSecure` | `true` | Set `false` only for local HTTP development |
| `cookieSameSite` | `none` when secure, else `lax` | SameSite policy |
| `allowedOrigins` | none | Origin allowlist for browsers without `Sec-Fetch-Site` |
| `accessCookieName` | `seamless-access` | Session cookie name |
| `registrationCookieName` | `seamless-ephemeral` | Registration cookie name |
| `refreshCookieName` | `seamless-refresh` | Refresh cookie name |
| `preAuthCookieName` | `seamless-ephemeral` | Login-initiation cookie name |
| `messaging` | none | Adopter-supplied delivery transports and overrides |
| `resolveClientIp` | none | Picks the end user's IP to forward |

The session helpers take `authServerUrl`, `cookieSecret`, and optionally
`serviceSecret`, `jwksKid`, the cookie names, and `userAgent`.

### Client IP

A route handler has no trustworthy source for the client address: any caller
can set `X-Forwarded-For`. So nothing is forwarded unless you pass
`resolveClientIp`, reading the header your platform sets and a client cannot:

```ts
createSeamlessAuthHandler({
  // ...
  resolveClientIp: (request) => request.headers.get("x-real-ip") ?? undefined,
});
```

A value that is not an IP address is dropped. The browser's `User-Agent` is
always forwarded, capped at 512 characters: it is self-reported either way.

## Relationship to the other adapters

This adapter serves the same routes and issues the same cookies as
`@seamless-auth/express` and `@seamless-auth/fastify`. Its tests run the
Fastify parity scenarios, cookie and bearer transport both, against the Express
adapter and assert the status, body, and every `Set-Cookie` header match.

Two differences follow from having no framework underneath:

- request bodies are parsed here, the way Express's `json()` does: only
  `application/json`, strict, 100kb maximum
- an unknown route answers `404 { "error": "not_found" }` as JSON

The admin console proxy is not included yet.

## License

AGPL-3.0-only. Copyright © Fells Code, LLC.
