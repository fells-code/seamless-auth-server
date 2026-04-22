import { authFetch } from "../authFetch.js";

export interface BootstrapAdminInviteOptions {
  authServerUrl: string;
  email: string;
  authorization?: string;
  externalDelivery?: boolean;
}

export interface BootstrapAdminInviteResult {
  status: number;
  body?: {
    url?: string;
    expiresAt: string;
    token?: string;
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
      headers: {
        authorization: opts.authorization || "",
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
      error: data?.error?.message || "bootstrap_failed",
    };
  }

  return {
    status: up.status,
    body: data?.data,
  };
}
