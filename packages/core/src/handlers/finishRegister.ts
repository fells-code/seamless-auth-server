import { authFetch } from "../authFetch.js";
import { readPassthroughFailure } from "../upstreamError.js";
import type { ResultFailure } from "../result.js";

export interface FinishRegisterInput {
  authorization?: string;
  headers?: Record<string, string>;
  body: unknown;
  serviceAuthorization?: string;
  forwardedClientIp?: string;
  forwardedUserAgent?: string;
}

export interface FinishRegisterOptions {
  authServerUrl: string;
}

export interface FinishRegisterResult extends ResultFailure {
  status: number;
}

export async function finishRegisterHandler(
  input: FinishRegisterInput,
  opts: FinishRegisterOptions,
): Promise<FinishRegisterResult> {
  const up = await authFetch(`${opts.authServerUrl}/webAuthn/register/finish`, {
    method: "POST",
    authorization: input.authorization,
    headers: input.headers,
    body: input.body,
    serviceAuthorization: input.serviceAuthorization,
    forwardedClientIp: input.forwardedClientIp,
    forwardedUserAgent: input.forwardedUserAgent,
  });

  const data = await up.json();

  if (!up.ok) {
    return {
      status: up.status,
      ...readPassthroughFailure(data),
    };
  }

  // Enrolling a passkey is not a sign-in. This route takes the access cookie,
  // so the caller already holds a session, and issuing a second one left the
  // first live and unrevoked while counting against the API's concurrent
  // session limit, which can evict the user's other devices. The auth API
  // stopped returning tokens here for the same reason.
  return { status: 204 };
}
