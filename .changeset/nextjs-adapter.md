---
'@seamless-auth/nextjs': minor
---

Add `@seamless-auth/nextjs`, an adapter for the Next.js App Router.

- `createSeamlessAuthHandler(options)` returns the `GET`, `POST`, `PATCH`, and `DELETE` handlers for an `app/auth/[...seamless]/route.ts` catch-all. It serves the same routes and issues the same cookies as the Express and Fastify adapters, cookie and bearer transport both.
- `getSeamlessSession(cookies, options)` resolves the signed-in user for a server component, in the shape `@seamless-auth/react`'s `AuthProvider` takes as `initialSession`. It verifies the access cookie locally and never refreshes.
- `hasSeamlessSession` and `getSeamlessClaims` check the cookies locally, with no network call, for route protection in `proxy.ts`.
