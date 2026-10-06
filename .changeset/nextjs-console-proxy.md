---
"@seamless-auth/nextjs": minor
---

Add `createSeamlessConsoleProxy`, which serves the Seamless admin console from a Next.js application. Mount it at `app/console/[[...path]]/route.ts` and export its `GET` and `HEAD`, and the dashboard loads from the same origin as `/auth`, as it does with the Express and Fastify console proxies. It forwards only the method and the path upstream, copies the caching headers back, and refuses any path that leaves the console subtree. A `mountPath` option covers a route mounted elsewhere or under a Next.js `basePath`. Closes #185.
