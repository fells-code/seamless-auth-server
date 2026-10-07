import {
  assertSecretStrength,
  authenticateCookie,
  authFetch,
  verifyRefreshCookie,
  type SeamlessAuthUser,
} from "@seamless-auth/core";
import type { MeResponse } from "@seamless-auth/types";

import { buildProxyServiceAuthorization } from "./internal/buildAuthorization";

/**
 * The read side of a cookie store. Both `await cookies()` from `next/headers`
 * and `request.cookies` in `proxy.ts` satisfy it.
 */
export interface CookieReader {
  get(name: string): { value: string } | undefined;
}

export interface SeamlessSessionOptions {
  authServerUrl: string;
  /**
   * Accepted so one options object can serve the route handler and these
   * helpers. The helpers verify only the adapter's own cookies, never a token
   * the auth server signed, so it changes nothing here.
   */
  authServerIssuer?: string;
  cookieSecret: string;
  /** Lets the auth API trust the forwarded user agent. Optional here. */
  serviceSecret?: string;
  jwksKid?: string;
  accessCookieName?: string;
  refreshCookieName?: string;
  /** The browser's user agent, for the auth API to record instead of this server's. */
  userAgent?: string;
}

/**
 * The signed-in user's `/users/me` response: the same wire type the React SDK's
 * `AuthProvider` takes as `initialSession`, so it passes straight through.
 */
export type SeamlessSession = MeResponse;

/** What the access cookie says about the user, minus the upstream token. */
export type SeamlessClaims = Omit<SeamlessAuthUser, "token">;

function accessCookie(
  cookies: CookieReader,
  opts: Pick<SeamlessSessionOptions, "accessCookieName">,
) {
  return cookies.get(opts.accessCookieName ?? "seamless-access")?.value;
}

/**
 * Verifies the access cookie locally, without a network call. For `proxy.ts`
 * and role checks that run on every request.
 *
 * The upstream access token is left out on purpose: these claims are easy to
 * hand to a client component, and anything handed to one is serialized into
 * the page.
 */
export function getSeamlessClaims(
  cookies: CookieReader,
  opts: Pick<SeamlessSessionOptions, "cookieSecret" | "accessCookieName">,
): SeamlessClaims | null {
  const { user } = authenticateCookie({
    token: accessCookie(cookies, opts),
    cookieSecret: opts.cookieSecret,
  });

  if (!user) {
    return null;
  }

  const { token: _token, ...claims } = user;
  return claims;
}

/**
 * Whether the request carries a session the browser can use, checked locally.
 *
 * A valid refresh cookie counts: its access cookie may simply have expired, and
 * the first call to the auth routes renews it. Treating that as signed out would
 * send a returning user to the sign-in page once every access-token lifetime.
 */
export function hasSeamlessSession(
  cookies: CookieReader,
  opts: Pick<
    SeamlessSessionOptions,
    "cookieSecret" | "accessCookieName" | "refreshCookieName"
  >,
): boolean {
  if (getSeamlessClaims(cookies, opts)) {
    return true;
  }

  const refresh = cookies.get(opts.refreshCookieName ?? "seamless-refresh")?.value;
  return Boolean(refresh && verifyRefreshCookie(refresh, opts.cookieSecret));
}

/**
 * Resolves the signed-in user's session for a server component.
 *
 * Verifies the access cookie locally and asks the auth API directly with the
 * token inside it. It never refreshes. A refresh here would rotate the refresh
 * token in a response the browser never receives, and the browser's own next
 * refresh would then be refused as a replay and revoke the session. So an
 * expired access cookie resolves to `null`, and the client renews the session
 * through the auth routes as usual.
 */
export async function getSeamlessSession(
  cookies: CookieReader,
  opts: SeamlessSessionOptions,
): Promise<SeamlessSession | null> {
  assertSecretStrength("cookieSecret", opts.cookieSecret);

  const { user } = authenticateCookie({
    token: accessCookie(cookies, opts),
    cookieSecret: opts.cookieSecret,
  });

  if (typeof user?.token !== "string") {
    return null;
  }

  const response = await authFetch(`${opts.authServerUrl}/users/me`, {
    method: "GET",
    authorization: `Bearer ${user.token}`,
    serviceAuthorization: buildProxyServiceAuthorization(opts),
    forwardedUserAgent: opts.userAgent?.trim().slice(0, 512) || undefined,
  });

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as Partial<MeResponse> | null;

  if (!data?.user) {
    return null;
  }

  return {
    user: data.user,
    credentials: data.credentials ?? [],
    organizations: data.organizations,
    activeOrganization: data.activeOrganization,
  };
}
