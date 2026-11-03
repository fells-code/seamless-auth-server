---
"@seamless-auth/core": minor
"@seamless-auth/express": minor
"@seamless-auth/fastify": minor
"@seamless-auth/nextjs": minor
---

Deliver enrollment invites through adopter messaging (#183). With `messaging` configured, `POST /admin/enrollment/invites` now asks the auth API for external delivery (`x-seamless-auth-delivery-mode: external`, with the `seamless-auth-external-delivery` service token) and sends each invite in `results[].delivery` through `deliverAuthMessage`, so `handlers.sendEnrollmentInviteEmail`, `overrides.enrollmentInviteEmail` or the email transport send it instead of the auth API's mail system. Without `messaging` the route is unchanged.

The response no longer carries `results[].delivery`, so recipient addresses and sign-in links are not echoed to the browser. A recipient whose delivery throws is reported as `{ "status": "skipped", "reason": "delivery_failed" }` and `sent` and `skipped` are adjusted; the other recipients are still sent and the route answers 200. The auth API has already recorded that recipient as invited, so repeating the call within a day reports them as `recently_invited`.
