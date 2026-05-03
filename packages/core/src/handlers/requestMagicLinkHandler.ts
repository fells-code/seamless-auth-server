import { authFetch } from "../authFetch.js";

export interface RequestMagicLinkInput {
  authorization?: string;
}

export interface RequestMagicLinkOptions {
  authServerUrl: string;
  externalDelivery?: boolean;
  forwardedClientIp?: string;
}

export interface RequestMagicLinkResult {
  status: number;
  body?: unknown;
  error?: unknown;
}

export async function requestMagicLinkHandler(
  input: RequestMagicLinkInput,
  opts: RequestMagicLinkOptions,
): Promise<RequestMagicLinkResult> {
  const up = await authFetch(`${opts.authServerUrl}/magic-link`, {
    method: "GET",
    authorization: input.authorization,
    forwardedClientIp: opts.forwardedClientIp,
    ...(opts.externalDelivery
      ? {
          headers: {
            "x-seamless-auth-delivery-mode": "external",
          },
        }
      : {}),
  });

  const data = await up.json();

  if (!up.ok) {
    return {
      status: up.status,
      error: data,
    };
  }

  return {
    status: up.status,
    body: data,
  };
}
