import { authFetch } from "../authFetch.js";
import type { CookiePayload } from "../ensureCookies.js";
import { verifySignedAuthResponse } from "../verifySignedAuthResponse.js";

export interface OAuthHandlerOptions {
  authServerUrl: string;
  audience: string;
  cookieDomain?: string;
  accessCookieName: string;
  refreshCookieName: string;
}

export interface OAuthRequestInput {
  providerId?: string;
  body?: unknown;
  forwardedClientIp?: string;
}

export interface OAuthHandlerResult {
  status: number;
  body?: unknown;
  error?: unknown;
  setCookies?: {
    name: string;
    value: CookiePayload;
    ttl: number;
    domain?: string;
  }[];
}

export async function listOAuthProvidersHandler(
  opts: Pick<OAuthHandlerOptions, "authServerUrl">,
) {
  const up = await authFetch(`${opts.authServerUrl}/oauth/providers`, {
    method: "GET",
  });

  const data = await up.json();

  return {
    status: up.status,
    ...(up.ok ? { body: data } : { error: data }),
  };
}

export async function startOAuthLoginHandler(
  input: OAuthRequestInput,
  opts: Pick<OAuthHandlerOptions, "authServerUrl">,
) {
  const up = await authFetch(
    `${opts.authServerUrl}/oauth/${encodeURIComponent(input.providerId!)}/start`,
    {
      method: "POST",
      body: input.body,
      forwardedClientIp: input.forwardedClientIp,
    },
  );

  const data = await up.json();

  return {
    status: up.status,
    ...(up.ok ? { body: data } : { error: data }),
  };
}

export async function finishOAuthLoginHandler(
  input: OAuthRequestInput,
  opts: OAuthHandlerOptions,
): Promise<OAuthHandlerResult> {
  const up = await authFetch(
    `${opts.authServerUrl}/oauth/${encodeURIComponent(input.providerId!)}/callback`,
    {
      method: "POST",
      body: input.body,
      forwardedClientIp: input.forwardedClientIp,
    },
  );

  const data = await up.json();

  if (!up.ok) {
    return {
      status: up.status,
      error: data,
    };
  }

  const verifiedAccessToken = await verifySignedAuthResponse(
    data.token,
    opts.authServerUrl,
    opts.audience,
  );

  if (!verifiedAccessToken) {
    throw new Error("Invalid signed response from Auth Server");
  }

  if (verifiedAccessToken.sub !== data.sub) {
    throw new Error("Signature mismatch with data payload");
  }

  const sessionId =
    typeof verifiedAccessToken.sid === "string"
      ? verifiedAccessToken.sid
      : undefined;

  return {
    status: up.status,
    body: data,
    setCookies: [
      {
        name: opts.accessCookieName,
        value: {
          sub: data.sub,
          ...(sessionId === undefined ? {} : { sessionId }),
          token: data.token,
          roles: data.roles,
          email: data.email,
          phone: data.phone,
          organizationId: data.organizationId ?? null,
        },
        ttl: data.ttl,
        domain: opts.cookieDomain,
      },
      {
        name: opts.refreshCookieName,
        value: {
          sub: data.sub,
          refreshToken: data.refreshToken,
        },
        ttl: data.refreshTtl,
        domain: opts.cookieDomain,
      },
    ],
  };
}
