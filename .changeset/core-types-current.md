---
"@seamless-auth/core": minor
"@seamless-auth/nextjs": patch
---

Depend on `@seamless-auth/types` `^0.26.0` (core was on `^0.4.0`, the Next.js adapter on `^0.25.0`). `deliverAuthMessage` now delivers the `enrollment_invite_email` kind: a default email linking to the sign-in page, an optional `handlers.sendEnrollmentInviteEmail`, and an optional `overrides.enrollmentInviteEmail`. A delivery kind the adapter does not recognize is now logged as a warning instead of being dropped silently.
