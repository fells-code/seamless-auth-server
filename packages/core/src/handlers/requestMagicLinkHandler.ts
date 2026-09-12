import { authFetch } from "../authFetch.js";
import { readPassthroughFailure } from "../upstreamError.js";
import { EXTERNAL_DELIVERY_HEADERS } from "../apiContract.js";
import { buildUpstreamUrl } from "../proxyRequest.js";
import type { ResultFailure } from "../result.js";

export interface RequestMagicLinkInput {
  authorization?: string;
  /**
   * Where the emailed link should land, for a tenant whose web and mobile clients
   * need different destinations. Forwarded as-is: the auth API validates it against
   * the configured origins and answers 400 if it is not allowed, so the decision
   * stays in one place rather than being made again here.
   */
  redirectUri?: string;
}

export interface RequestMagicLinkOptions {
  authServerUrl: string;
  externalDelivery?: boolean;
  forwardedClientIp?: string;
  forwardedUserAgent?: string;
  serviceAuthorization?: string;
}

export interface RequestMagicLinkResult extends ResultFailure {
  status: number;
  body?: unknown;
}

export async function requestMagicLinkHandler(
  input: RequestMagicLinkInput,
  opts: RequestMagicLinkOptions,
): Promise<RequestMagicLinkResult> {
  const url = buildUpstreamUrl(
    opts.authServerUrl,
    "/magic-link",
    input.redirectUri ? { redirectUri: input.redirectUri } : undefined,
  );

  const up = await authFetch(url, {
    method: "GET",
    authorization: input.authorization,
    forwardedClientIp: opts.forwardedClientIp,
    forwardedUserAgent: opts.forwardedUserAgent,
    serviceAuthorization: opts.serviceAuthorization,
    ...(opts.externalDelivery
      ? {
          headers: EXTERNAL_DELIVERY_HEADERS,
        }
      : {}),
  });

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
