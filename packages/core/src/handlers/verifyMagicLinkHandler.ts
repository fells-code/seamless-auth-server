import { authFetch } from "../authFetch.js";
import { readPassthroughFailure } from "../upstreamError.js";
import type { ResultFailure } from "../result.js";

export interface VerifyMagicLinkInput {
  token: string;
}

export interface VerifyMagicLinkOptions {
  authServerUrl: string;
  serviceAuthorization?: string;
  forwardedClientIp?: string;
}

export interface VerifyMagicLinkResult extends ResultFailure {
  status: number;
  body?: unknown;
}

export async function verifyMagicLinkHandler(
  input: VerifyMagicLinkInput,
  opts: VerifyMagicLinkOptions,
): Promise<VerifyMagicLinkResult> {
  const up = await authFetch(
    `${opts.authServerUrl}/magic-link/verify/${encodeURIComponent(input.token)}`,
    {
      method: "GET",
      serviceAuthorization: opts.serviceAuthorization,
      forwardedClientIp: opts.forwardedClientIp,
    },
  );

  const data = await up.json();

  if (!up.ok) {
    return {
      status: up.status,
      ...readPassthroughFailure(data),
    };
  }

  return {
    status: up.status,
    body: data,
  };
}
