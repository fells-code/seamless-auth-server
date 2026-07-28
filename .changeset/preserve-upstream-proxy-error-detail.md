---
"@seamless-auth/core": patch
"@seamless-auth/express": patch
---

Preserve the upstream error detail on the admin, session, internal-metrics, and system-config proxy routes.

These handlers read the failure code out of the upstream body's `error` key and fell back to a constant (`admin_request_failed`, `session_request_failed`, `internal_request_failed`, `failed_to_fetch_roles`, `failed_to_fetch_config`, `failed_to_update_config`) whenever that key was missing. The auth API answers a validation failure with a Zod body shaped `{ name, message }` and no `error` key, so every validation failure collapsed to the constant. A `PATCH /admin/users/:id` rejected for its `phone` field came back as `{"error":"admin_request_failed"}`, with nothing naming the field, and the detail was not recoverable from the API's request logs either.

The handler results and the Express responses now carry the upstream detail. `error` is the upstream `error` string when present, otherwise the upstream `message` string, and only then the constant fallback for an empty or non-JSON-object body. A new optional `details` field carries the parsed upstream body whenever it holds more than the derived `error` string, so a Zod body reaches the caller intact.

This is additive: a response that already carried an upstream `error` code is unchanged and gains no `details` key. Callers that switch on the constant fallback for validation failures should read `details` (or the now-descriptive `error`) instead.
