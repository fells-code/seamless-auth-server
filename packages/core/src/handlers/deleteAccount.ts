import { authFetch } from "../authFetch.js";
import type { ResultFailure } from "../result.js";
import { readUpstreamFailure } from "../upstreamError.js";

export interface DeleteAccountOptions {
  authServerUrl: string;
  accessCookieName: string;
  registrationCookieName: string;
  refreshCookieName: string;
  authorization?: string;
  serviceAuthorization?: string;
  forwardedClientIp?: string;
  forwardedUserAgent?: string;
}

export interface DeleteAccountResult extends ResultFailure {
  status: number;
  body?: unknown;
  clearCookies?: string[];
}

/**
 * The signed-in user's own account, deleted: `DELETE /users/delete` upstream.
 *
 * On success the session cookies go the way `/logout` clears them. The
 * account they name no longer exists, so a browser that kept them would send
 * them until they expired and the silent refresh would try to renew a
 * session that is gone. A failure leaves them alone: the account is still
 * there and the caller is still signed in to it.
 */
export async function deleteAccountHandler(
  opts: DeleteAccountOptions,
): Promise<DeleteAccountResult> {
  const up = await authFetch(`${opts.authServerUrl}/users/delete`, {
    method: "DELETE",
    authorization: opts.authorization,
    serviceAuthorization: opts.serviceAuthorization,
    forwardedClientIp: opts.forwardedClientIp,
    forwardedUserAgent: opts.forwardedUserAgent,
  });

  const data = await up.json();

  if (!up.ok) {
    return {
      status: up.status,
      ...readUpstreamFailure(data, "account_deletion_failed"),
    };
  }

  return {
    status: up.status,
    body: data,
    clearCookies: [
      opts.accessCookieName,
      opts.registrationCookieName,
      opts.refreshCookieName,
    ],
  };
}
