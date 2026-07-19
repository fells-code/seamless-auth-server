---
"@seamless-auth/core": patch
"@seamless-auth/express": patch
---

Register `/users/update`, `/users/credentials`, `/sessions`, and `/admin/credential-count` in the core cookie requirements table. Without these entries the ensureCookies middleware never populated `req.cookiePayload`, so `/users/update` and `/users/credentials` returned 401 and `/sessions` and `/admin/credential-count` failed to forward the access token upstream.
