import { authFetch } from "../authFetch.js";
import type { ResultFailure } from "../result.js";
import { readUpstreamFailure } from "../upstreamError.js";

export interface SystemConfigOptions {
  authServerUrl: string;
  authorization?: string;
  serviceAuthorization?: string;
  forwardedClientIp?: string;
}

export interface SystemConfigResult extends ResultFailure {
  status: number;
  body?: any;
}

/**
 * The configuration a signed-out client may read.
 *
 * Unlike the other handlers here it forwards no identity at all. The sign-in
 * screens call this before anyone has a session, so attaching an authorization
 * header would make the call fail exactly when it is needed. Upstream serves it
 * unauthenticated for the same reason.
 */
export async function getPublicSystemConfigHandler(
  opts: Pick<SystemConfigOptions, "authServerUrl" | "forwardedClientIp">,
): Promise<SystemConfigResult> {
  const up = await authFetch(`${opts.authServerUrl}/system-config/public`, {
    method: "GET",
    forwardedClientIp: opts.forwardedClientIp,
  });

  const data = await up.json();

  if (!up.ok) {
    return {
      status: up.status,
      ...readUpstreamFailure(data, "failed_to_fetch_public_system_config"),
    };
  }

  return {
    status: up.status,
    body: data,
  };
}

export async function getAvailableRolesHandler(
  opts: SystemConfigOptions,
): Promise<SystemConfigResult> {
  const up = await authFetch(`${opts.authServerUrl}/system-config/roles`, {
    method: "GET",
    authorization: opts.authorization,
    serviceAuthorization: opts.serviceAuthorization,
    forwardedClientIp: opts.forwardedClientIp,
  });

  const data = await up.json();

  if (!up.ok) {
    return {
      status: up.status,
      ...readUpstreamFailure(data, "failed_to_fetch_roles"),
    };
  }

  return {
    status: up.status,
    body: data,
  };
}

export async function getSystemConfigAdminHandler(
  opts: SystemConfigOptions,
): Promise<SystemConfigResult> {
  const up = await authFetch(`${opts.authServerUrl}/system-config/admin`, {
    method: "GET",
    authorization: opts.authorization,
    serviceAuthorization: opts.serviceAuthorization,
    forwardedClientIp: opts.forwardedClientIp,
  });

  const data = await up.json();

  if (!up.ok) {
    return {
      status: up.status,
      ...readUpstreamFailure(data, "failed_to_fetch_config"),
    };
  }

  return {
    status: up.status,
    body: data,
  };
}

export async function updateSystemConfigHandler(
  opts: SystemConfigOptions & { payload: any },
): Promise<SystemConfigResult> {
  const up = await authFetch(`${opts.authServerUrl}/system-config/admin`, {
    method: "PATCH",
    authorization: opts.authorization,
    body: opts.payload,
    serviceAuthorization: opts.serviceAuthorization,
    forwardedClientIp: opts.forwardedClientIp,
  });

  const data = await up.json();

  if (!up.ok) {
    return {
      status: up.status,
      ...readUpstreamFailure(data, "failed_to_update_config"),
    };
  }

  return {
    status: up.status,
    body: data,
  };
}
