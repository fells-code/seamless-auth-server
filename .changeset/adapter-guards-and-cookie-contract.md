---
"@seamless-auth/core": minor
"@seamless-auth/express": patch
---

Move the remaining guard decisions into core, and fully specify a cookie's lifetime in the response contract.

`checkOrigin`, `authenticateCookie`, and `authorizeRoles` join `checkProxyIdentity`: each takes the request facts a guard needs and returns a `GuardRejection` or nothing, so an adapter reads headers and cookies and writes a response but decides nothing. The Express origin guard, `requireAuth`, and `requireRole` now call them, which is a straight substitution with no behavior change.

`SeamlessAuthUser` comes from `@seamless-auth/types`, which already defines it, rather than being declared again here. It is re-exported from `@seamless-auth/core` and `@seamless-auth/express` under the same name, so nothing changes for adopters. The re-export is type-only, so it is erased at compile time and neither `zod` nor the schema barrel enters the runtime module graph.

`SetCookieCommand` and `ClearCookieCommand` now carry an `expires` alongside `maxAgeSeconds`. Previously the command specified only a max age, and two adapters could satisfy it while emitting different headers: Express sent both `Expires` and `Max-Age`, and a second adapter sent only `Max-Age`, which older clients treat as a session cookie. Specifying both means every adapter emits the same header for the same instruction. Clearing carries the epoch for the same reason.

No change to what `@seamless-auth/express` sends. The `expires` it now receives explicitly is the value it was already deriving.
