---
"@seamless-auth/express": patch
---

Warn when external delivery is requested but the auth server returns no delivery payload. The four auth-message routes (OTP email, OTP SMS, magic-link email, bootstrap invite email) previously fell through to a plain success response in that case, so a `serviceSecret` that does not match the auth server's `API_SERVICE_TOKEN` produced a successful-looking response with no message sent and nothing logged. The delivery branch shared by those routes is now a single `applyExternalDelivery` helper that logs a warning on a missing payload. Response bodies and status codes are unchanged. The messaging section of the README now documents `serviceSecret` as a prerequisite for auth-message delivery.
