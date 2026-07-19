---
"@seamless-auth/express": patch
---

Fix the silent-refresh service token so it carries the M2M contract issuer and audience (`iss: seamless-portal-api`, `aud: seamless-auth`) instead of the adopter-configured issuer and the auth server URL. The auth API validates the forwarded service token with a fixed issuer and audience, so the previous values caused the token to be rejected and the real client IP to be dropped on refresh, breaking IP-based rate limiting and anomaly detection.
