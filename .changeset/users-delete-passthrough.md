---
"@seamless-auth/core": patch
"@seamless-auth/express": patch
"@seamless-auth/fastify": patch
---

Pass `DELETE /users/delete` through, so the SDK's `deleteUser()` reaches the auth API.

The client SDK has always sent `DELETE /users/delete` to delete the signed-in user's own account,
and the auth API has always served it, but neither adapter registered the route: the call answered
the adapter's own 404 through `@seamless-auth/express` and the Fastify plugin alike. Nothing built
on the SDK could delete an account, which both app stores require.

Both adapters now forward it with the caller's credential. In cookie transport a successful
deletion clears the access, refresh and pre-auth cookies the way `/logout` does, since the account
they named no longer exists and the silent refresh would otherwise try to renew a session that is
gone; a refused deletion leaves them alone. In bearer transport the auth API's body passes through
and the client clears its own tokens, as it already does on that call. `deleteAccountHandler` is
exported from `@seamless-auth/core` for adapters built on it.
