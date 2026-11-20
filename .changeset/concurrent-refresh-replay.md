---
"@seamless-auth/core": patch
---

Document multi-instance deployment and test that two adapter instances refreshing the same cookie at once both succeed with the same refresh cookie, and that `refresh_token_reused` clears the cookies without a retry. Needs the auth API release that ships the refresh replay window (fells-code/seamless-auth-api#613).
