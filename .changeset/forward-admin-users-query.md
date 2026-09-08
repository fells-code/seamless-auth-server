---
"@seamless-auth/core": minor
"@seamless-auth/express": minor
"@seamless-auth/fastify": minor
---

Forward the query string on the two routes that dropped it.

`GET /admin/users` and `GET /internal/auth-events/login-stats` were built without
a query, so both adapters called the auth API with a bare path. Every other route
that reads query parameters forwarded them, which is what made these two hard to
notice: the endpoints answered `200` with the wrong page or the wrong window, and
nothing reported an error.

The visible effect was that the admin dashboard's user search and paging did
nothing. It sent `?search=...&limit=10&offset=N`, the adapter forwarded
`/admin/users`, and the API answered with its default first 50 users. The login
statistics panel ignored its time range the same way, so the range control on the
Security screen moved the other panels and not that one.

`getUsersHandler` and `getLoginStatsHandler` in `@seamless-auth/core` now take an
optional `query` like the other list handlers. The change is additive for anyone
calling them directly, and both adapters pass the incoming query through.

Adopters should expect requests to start reaching the API as sent. A caller that
was relying on the dropped window will now get the page it actually asked for
rather than the API's default, and a query the API rejects now surfaces as a
`400` instead of being silently discarded.

Both adapters are now held to one table of every query-carrying route, so a route
added without forwarding its query fails a test rather than shipping quiet.
