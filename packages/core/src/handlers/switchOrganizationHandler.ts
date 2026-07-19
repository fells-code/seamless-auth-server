import { authFetch } from "../authFetch.js";
import type { CookiePayload } from "../ensureCookies.js";
import { verifySignedAuthResponse } from "../verifySignedAuthResponse.js";

export interface SwitchOrganizationInput {
  organizationId: string;
  authorization?: string;
  forwardedClientIp?: string;
}

export interface SwitchOrganizationOptions {
  authServerUrl: string;
  audience: string;
  cookieDomain?: string;
  accessCookieName: string;
}

export interface SwitchOrganizationResult {
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

export async function switchOrganizationHandler(
  input: SwitchOrganizationInput,
  opts: SwitchOrganizationOptions,
): Promise<SwitchOrganizationResult> {
  const up = await authFetch(
    `${opts.authServerUrl}/organizations/${encodeURIComponent(input.organizationId)}/switch`,
    {
      method: "POST",
      authorization: input.authorization,
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

  if (!data?.token || !data?.sub) {
    return {
      status: up.status,
      body: data,
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
    ],
  };
}
