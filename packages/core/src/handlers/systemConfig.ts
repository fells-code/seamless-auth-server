import { authFetch } from "../authFetch.js";

export interface SystemConfigOptions {
  authServerUrl: string;
  authorization?: string;
}

export interface SystemConfigResult {
  status: number;
  body?: any;
  error?: string;
}

export async function getAvailableRolesHandler(
  opts: SystemConfigOptions,
): Promise<SystemConfigResult> {
  const up = await authFetch(`${opts.authServerUrl}/system-config/roles`, {
    method: "GET",
    authorization: opts.authorization,
  });

  const data = await up.json();

  if (!up.ok) {
    return {
      status: up.status,
      error: data?.error || "failed_to_fetch_roles",
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
  });

  const data = await up.json();

  if (!up.ok) {
    return {
      status: up.status,
      error: data?.error || "failed_to_fetch_config",
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
  });

  const data = await up.json();

  if (!up.ok) {
    return {
      status: up.status,
      error: data?.error || "failed_to_update_config",
    };
  }

  return {
    status: up.status,
    body: data,
  };
}
