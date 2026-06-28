---
"@seamless-auth/core": minor
"@seamless-auth/express": patch
---

Issue a session on OTP-based registration. Registration now starts with just an
email, and verifying the registration email OTP completes sign-up and returns a
session. The adapter previously proxied `/otp/verify-email-otp` and
`/otp/verify-phone-otp` without setting cookies, so browser users finished
registration unauthenticated. A new `verifyRegistrationOtpHandler` (core) plus a
`verifyRegistrationOtp` express handler now set the session cookies on these
routes (tolerating a phone-first step that returns no session yet), mirroring the
login OTP verify handlers.
