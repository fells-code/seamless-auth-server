---
"@seamless-auth/core": minor
"@seamless-auth/express": minor
"@seamless-auth/fastify": minor
"@seamless-auth/nextjs": minor
---

- `GET /internal/metrics/dashboard` and `GET /internal/security/anomalies` now forward their query string, so the time range and paging the auth API accepts on them reach it (fells-code/seamless-auth-api#132). Before, both handlers were built without a query, and a range from the dashboard was silently dropped. `getDashboardMetricsHandler` and `getSecurityAnomaliesHandler` accept `query`.
- Pass `GET /admin/review-accounts` (with its `days` query) through to the auth API with the caller's access identity (fells-code/seamless-auth-api#331).
