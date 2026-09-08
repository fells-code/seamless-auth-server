---
'@seamless-auth/express': minor
'@seamless-auth/fastify': minor
---

Pass `DELETE /admin/organizations/:organizationId` through to the auth API.

The auth API gained an organization delete route, and neither adapter forwarded it,
so a dashboard or backend calling through the adapter got a 404 from the adapter's
own router rather than reaching the API at all. Both adapters now proxy it with the
access identity, the same way the neighbouring organization routes are proxied.

`GET /admin/organizations` needed no adapter change. Both adapters already forward
the query string, so the `limit`, `offset` and `search` parameters the API added
alongside the delete route reach it without one.

Requires an auth API that serves the route. Calling it against an older API returns
that API's 404, so the adapters can ship first and there is no lockstep requirement
in either direction.
