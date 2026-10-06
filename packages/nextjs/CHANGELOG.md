# @seamless-auth/nextjs

## 0.1.0

### Minor Changes

- c8db0ca: Add `@seamless-auth/nextjs`, an adapter for the Next.js App Router.

  - `createSeamlessAuthHandler(options)` returns the `GET`, `POST`, `PATCH`, and `DELETE` handlers for an `app/auth/[...seamless]/route.ts` catch-all. It serves the same routes and issues the same cookies as the Express and Fastify adapters, cookie and bearer transport both.
  - `getSeamlessSession(cookies, options)` resolves the signed-in user for a server component, in the shape `@seamless-auth/react`'s `AuthProvider` takes as `initialSession`. It verifies the access cookie locally and never refreshes.
  - `hasSeamlessSession` and `getSeamlessClaims` check the cookies locally, with no network call, for route protection in `proxy.ts`.

- e0cab5c: Relicense from AGPL-3.0-only to the Apache License, Version 2.0 (fells-code/seamless-auth-api#335). The `LICENSE` file, the `license` field and the license header in source files now say Apache-2.0, and the AGPL summary in `LICENSE.md` is removed.

### Patch Changes

- 5209e57: Type `getSeamlessSession`'s result as the `/users/me` wire type from `@seamless-auth/types`, the same one `@seamless-auth/react`'s `AuthProvider` takes as `initialSession`. Its credentials and organizations were typed as `unknown[]`, so passing the result to `initialSession` failed to type-check.
- Updated dependencies [e0cab5c]
  - @seamless-auth/core@0.17.0
