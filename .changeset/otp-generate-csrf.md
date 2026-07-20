---
"@seamless-auth/express": minor
---

Serve the OTP generate routes over POST instead of GET.

`GET /auth/otp/generate-phone-otp`, `-email-otp`, and their `-login-` variants were state-changing routes (each sends an SMS or email) reachable as a simple cross-site request, so an `<img src>` on any page could trigger unbounded OTP messages to a signed-in user. This is the same vector already closed for `/auth/magic-link`.

BREAKING: the four `GET /auth/otp/generate-*` routes are removed and replaced with POST. Pair this with `@seamless-auth/react` 0.5.0 or later, which requests them over POST. An older SDK that still issues GET will get a 404.
