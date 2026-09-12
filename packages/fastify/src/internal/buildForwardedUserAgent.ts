import type { FastifyRequest } from "fastify";

// The auth API caps what it records; anything beyond this is not a browser.
const MAX_LENGTH = 512;

/**
 * The browser's user agent, for the auth API to record instead of this
 * adapter's own. Unlike the client address it needs no trust decision: it is
 * self-reported by the browser either way, and the API only uses it for
 * telemetry and the magic link device binding.
 */
export function buildForwardedUserAgent(
  req: FastifyRequest,
): string | undefined {
  // Optional chaining because getSeamlessUser accepts a caller-built request.
  const header = req.headers?.["user-agent"];
  const candidate = (Array.isArray(header) ? header[0] : header)
    ?.trim()
    .slice(0, MAX_LENGTH);

  return candidate || undefined;
}
