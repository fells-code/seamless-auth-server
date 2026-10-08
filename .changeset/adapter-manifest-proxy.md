---
"@seamless-auth/core": minor
"@seamless-auth/express": minor
"@seamless-auth/fastify": minor
"@seamless-auth/nextjs": minor
---

Serve auth API routes from the adapter manifest (#201).

The auth API publishes which token each route takes and which tokens its response issues or clears at `/.well-known/seamless-adapter.json`. Every adapter now serves any route listed there that it has no handler of its own for, so a new API route works without a new release of these packages. Routes with their own handlers behave as before.

- Routes that had no passthrough now work: TOTP sign-in (`POST /totp/verify-login`), `POST /registration/phone` and `/registration/phone/verify`, `POST /admin/users/import`, and anything the API adds later.
- `@seamless-auth/nextjs` returns a `PUT` handler, so the OAuth provider retirement routes are reachable. Export it from the catch-all route: `export const { GET, POST, PUT, PATCH, DELETE } = createSeamlessAuthHandler(...)`.
- Fastify serves manifest routes whatever their path casing, as Express and Next.js already did.
- Routes served from the manifest never return `token` or `refreshToken` to the browser in cookie transport.
- `ensureCookies` takes optional `method` and `manifest`, and then loads the cookie the manifest names for the route.
- Core exports `createAdapterManifestSource`, `matchManifestRoute`, `handleManifestRoute`, `parseAdapterManifest`, `buildManifestPath` and `ADAPTER_MANIFEST_PATH`.

Each adapter fetches the manifest from the auth API on its first request, waiting up to five seconds, and keeps it for the life of the process. If the API does not serve one (versions before the manifest), it uses the copy bundled with the package and tries again a minute later. Tests that mock `fetch` will see this extra request; pass `fetchManifest: false` to use only the bundled copy.
