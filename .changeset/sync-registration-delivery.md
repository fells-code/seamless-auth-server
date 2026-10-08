---
"@seamless-auth/core": patch
---

Refresh the bundled adapter manifest. `POST /registration/register` and `POST /registration/phone` are now marked as delivery routes, so with `messaging` configured an adapter serving them from the bundled manifest sends the message itself instead of leaving it to the auth API.
