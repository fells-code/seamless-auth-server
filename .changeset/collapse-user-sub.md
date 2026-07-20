---
"@seamless-auth/express": minor
"@seamless-auth/core": minor
---

Breaking: remove the duplicate `sub` field from `SeamlessAuthUser`.

`requireAuth` populated both `id` and `sub` on `req.user` from the same access token `sub` claim.
Only `id` remains, which is also the identifier exposed by `getSeamlessUser`, so both user sources
now agree on one field name.

Adopters must replace `req.user.sub` with `req.user.id`. Any defensive `user.sub ?? user.id`
coalescing can be reduced to `user.id`. The `sub` claim inside JWT payloads is unchanged.

`getSeamlessUser` also gains a real return type. It previously returned `any` by default, which is
what made that coalescing look necessary. It now returns the exported `SeamlessUser` interface
(`id`, `email`, `phone`, `roles`, plus optional `lastLogin` and `activeOrganizationId`), matching
the auth API's `GET /users/me` response. The generic parameter is unchanged for callers that pass
their own type.
