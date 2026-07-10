---
"@seamless-auth/express": patch
---

Fix requireAuth dropping the access token from req.user. The middleware now
attaches the inner access token as req.user.token, so getSeamlessUser and
buildServiceAuthorization can forward it as the bearer credential when calling
the auth server. Previously trusted server adapters received a "Missing bearer"
error and every authenticated route returned 401.
