---
"@seamless-auth/core": minor
"@seamless-auth/express": minor
"@seamless-auth/fastify": minor
"@seamless-auth/nextjs": minor
---

Keep the session cookies when a refresh fails without the auth API refusing it, matching the Go adapter (fells-code/seamless-auth-go#22). The silent refresh on the auth routes and cookie-transport `POST /refresh` used to clear the access and refresh cookies on any failure, so a network blip or an auth API restart signed the browser out.

The cookies are now cleared only when the auth API answers the refresh with 401, or the refresh cookie cannot be read. Those keep their current answers (`401 {"error":"Refresh failed"}` on a silent refresh, `401 {"error":"invalid_refresh_token"}` on `POST /refresh`). Otherwise the cookies stay and:

- the auth API cannot be reached: `502 {"error":"upstream_unavailable"}`;
- the auth API answers any other non-2xx status: that status and body pass through;
- the rotated session fails verification, or a 2xx carries no session: `502 {"error":"upstream_unavailable"}`. `POST /refresh` answered these with 500 before.

Core adds `refreshCookieSession`, which reports how a cookie rotation ended, and `failureBody`. `refreshAccessToken` keeps its signature. In-flight sharing and the 5 second window for a completed cookie rotation are unchanged, and only a successful rotation is kept. No request's abort signal reaches the upstream call, so a caller that goes away does not cancel a rotation other callers share.
