import { authFetch } from "../authFetch.js";
import type { CookiePayload } from "../ensureCookies.js";
import { verifySignedAuthResponse } from "../verifySignedAuthResponse.js";

export interface PollMagicLinkConfirmationInput {
  authorization?: string;
}

export interface PollMagicLinkConfirmationOptions {
  authServerUrl: string;
  cookieDomain?: string;
  accessCookieName: string;
  refreshCookieName: string;
}

export interface PollMagicLinkConfirmationResult {
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

export async function pollMagicLinkConfirmationHandler(
  input: PollMagicLinkConfirmationInput,
  opts: PollMagicLinkConfirmationOptions,
): Promise<PollMagicLinkConfirmationResult> {
  const up = await authFetch(`${opts.authServerUrl}/magic-link/check`, {
    method: "GET",
    authorization: input.authorization,
  });

  // 👇 Pending state (important for polling UX)
  if (up.status === 204) {
    return {
      status: 204,
      body: { message: "Not verified." },
    };
  }

  const data = await up.json();

  if (!up.ok) {
    return {
      status: up.status,
      error: data,
    };
  }

  // 👇 Web mode: auth server already handled cookies
  if (!data?.token || !data?.refreshToken || !data?.sub) {
    return {
      status: up.status,
      body: data,
    };
  }

  // 🔐 Verify signed response (same as WebAuthn flow)
  const verifiedAccessToken = await verifySignedAuthResponse(
    data.token,
    opts.authServerUrl,
  );

  if (!verifiedAccessToken) {
    throw new Error("Invalid signed response from Auth Server");
  }

  if (verifiedAccessToken.sub !== data.sub) {
    throw new Error("Signature mismatch with data payload");
  }

  return {
    status: 200,
    body: data,
    setCookies: [
      {
        name: opts.accessCookieName,
        value: {
          sub: data.sub,
          roles: data.roles,
          email: data.email,
          phone: data.phone,
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
