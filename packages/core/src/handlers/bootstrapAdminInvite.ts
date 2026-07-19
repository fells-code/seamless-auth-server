import { authFetch } from "../authFetch.js";

export interface BootstrapAdminInviteOptions {
  authServerUrl: string;
  email: string;
  authorization?: string;
  serviceAuthorization?: string;
  externalDelivery?: boolean;
  forwardedClientIp?: string;
}

export interface BootstrapAdminInviteResult {
  status: number;
  body?: {
    url?: string;
    expiresAt: string;
    token?: string;
    delivery?: unknown;
  };
  error?: string;
}

export async function bootstrapAdminInviteHandler(
  opts: BootstrapAdminInviteOptions,
): Promise<BootstrapAdminInviteResult> {
  const up = await authFetch(
    `${opts.authServerUrl}/internal/bootstrap/admin-invite`,
    {
      method: "POST",
      authorization: opts.authorization,
      serviceAuthorization: opts.serviceAuthorization,
      forwardedClientIp: opts.forwardedClientIp,
      headers: {
        ...(opts.externalDelivery
          ? {
              "x-seamless-auth-delivery-mode": "external",
            }
          : {}),
      },
      body: { email: opts.email },
    },
  );

  const data = await up.json();

  if (!up.ok) {
    return {
      status: up.status,
      error: data?.error?.message || data?.error || "bootstrap_failed",
    };
  }

  return {
    status: up.status,
    body: data?.data,
  };
}
