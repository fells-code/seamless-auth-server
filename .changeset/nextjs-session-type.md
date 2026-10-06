---
'@seamless-auth/nextjs': patch
---

Type `getSeamlessSession`'s result as the `/users/me` wire type from `@seamless-auth/types`, the same one `@seamless-auth/react`'s `AuthProvider` takes as `initialSession`. Its credentials and organizations were typed as `unknown[]`, so passing the result to `initialSession` failed to type-check.
