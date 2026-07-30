---
"@seamless-auth/core": patch
---

Let adopters route this package's diagnostics somewhere other than `console`.

Core wrote to `console` directly, so an adopter could not capture, level, or silence its output. An adapter with its own logger still leaked core's lines to `console`, which meant one request could produce output in two places.

`setSeamlessLogger(logger)` accepts anything with `warn` and `error`, which a platform logger already satisfies, and `setSeamlessLogger()` with no argument goes back to `console`. Nothing changes for callers that do not set one.

The logger is process-wide, not per-request, so it changes where core's diagnostics go rather than attaching request context to them. Core logs two things (a failed signature verification and a misconfigured external-delivery setup), and neither depends on request context. Threading a per-request logger through every handler would be a larger change.

New exports: `setSeamlessLogger`, `getSeamlessLogger`, `SeamlessLogger`.

Closes #137.
