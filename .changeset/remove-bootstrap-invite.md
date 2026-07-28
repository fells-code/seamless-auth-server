---
"@seamless-auth/core": minor
"@seamless-auth/express": minor
---

Remove the admin bootstrap invite flow from the adapter.

The Seamless Auth API dropped the flow, so `POST /internal/bootstrap/admin-invite` no longer exists upstream and the API never emits a `bootstrap_invite_email` delivery. Everything the adapter carried for it was unreachable: the proxy route returned whatever the upstream 404 produced, and the delivery branch could not be selected. The first admin is now granted through the API's `OWNER_EMAIL` instead.

BREAKING: `bootstrapAdminInviteHandler` (`@seamless-auth/core/handlers/bootstrapAdminInvite`) and the `SendBootstrapInviteEmailInput` type are gone, `AuthMessagingHandlers.sendBootstrapInviteEmail` and `AuthMessageOverrides.bootstrapInviteEmail` are removed, and `bootstrap_invite_email` is no longer a member of `AuthDeliveryInstruction`. Adopters passing a `sendBootstrapInviteEmail` handler or a `bootstrapInviteEmail` override should drop it; `handlers` is a `Partial`, so nothing else needs to change. Callers of the `/internal/bootstrap/admin-invite` route get a 404 from the adapter now rather than from the upstream API.

The `bootstrapToken` entries in the core redaction patterns stay. They are a log-scrubbing denylist, and keeping a stale term only makes scrubbing more conservative.
