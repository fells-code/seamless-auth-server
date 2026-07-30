import jwt from "jsonwebtoken";

import type { CookiePayload } from "./ensureCookies.js";
import type { ResultFailure } from "./result.js";

export type CookieSameSite = "lax" | "none" | "strict";

export interface CookieSecurityOptions {
  cookieSecret: string;
  cookieDomain?: string;
  cookieSecure?: boolean;
  cookieSameSite?: CookieSameSite;
}

/**
 * Resolves the effective `SameSite` policy. Shared so the cookie attributes and
 * any policy that keys off `SameSite=None` cannot drift. Browsers reject
 * `SameSite=None` without `Secure`, so the default tracks `secure`.
 */
export function resolveCookieSameSite(
  opts: Pick<CookieSecurityOptions, "cookieSecure" | "cookieSameSite">,
): CookieSameSite {
  const secure = opts.cookieSecure ?? true;
  return opts.cookieSameSite ?? (secure ? "none" : "lax");
}

export interface SetCookieCommand {
  name: string;
  /** Already signed. Adapters emit it as-is. */
  value: string;
  domain?: string;
  maxAgeSeconds: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: CookieSameSite;
  path: string;
}

export interface ClearCookieCommand {
  name: string;
  domain?: string;
  secure: boolean;
  sameSite: CookieSameSite;
  path: string;
}

/**
 * The three things an adapter has to be able to do with its framework's
 * response. Everything else about turning a handler result into a response,
 * including cookie format and attribute policy, is decided here so adapters do
 * not each reimplement it.
 */
export interface ResponseAdapter {
  setCookie(command: SetCookieCommand): void;
  clearCookie(command: ClearCookieCommand): void;
  /** `body` is `undefined` when the response carries none. */
  send(status: number, body: unknown): void;
}

export interface SessionCookie {
  name: string;
  value: CookiePayload;
  ttl: number;
  domain?: string;
}

export interface AppliableResult extends ResultFailure {
  status: number;
  body?: unknown;
  setCookies?: SessionCookie[];
  clearCookies?: string[];
}

/**
 * Signs a session cookie payload. The cookie format is core's, not the
 * adapter's: an adapter that signed differently would mint sessions this
 * package cannot read back.
 */
export function signSessionCookie(
  payload: CookiePayload,
  secret: string,
  ttlSeconds: number,
): string {
  return jwt.sign(payload, secret, {
    algorithm: "HS256",
    expiresIn: `${ttlSeconds}s`,
  });
}

function requireSecret(opts: CookieSecurityOptions): string {
  if (!opts.cookieSecret) {
    throw new Error("Missing cookieSecret");
  }

  return opts.cookieSecret;
}

/**
 * Writes a result's cookie instructions, without touching the body.
 *
 * Separate from {@link applyResult} for middleware, which has to apply cookies
 * on a request that then continues rather than one that is being answered.
 *
 * Clears run before sets, because a result that does both is replacing a
 * session rather than ending one.
 */
export function applyCookies(
  result: Pick<AppliableResult, "setCookies" | "clearCookies">,
  adapter: Pick<ResponseAdapter, "setCookie" | "clearCookie">,
  opts: CookieSecurityOptions,
): void {
  const secure = opts.cookieSecure ?? true;
  const sameSite = resolveCookieSameSite(opts);

  if (result.clearCookies?.length) {
    for (const name of result.clearCookies) {
      adapter.clearCookie({
        name,
        domain: opts.cookieDomain,
        secure,
        sameSite,
        path: "/",
      });
    }
  }

  if (result.setCookies?.length) {
    const secret = requireSecret(opts);

    for (const cookie of result.setCookies) {
      adapter.setCookie({
        name: cookie.name,
        value: signSessionCookie(cookie.value, secret, cookie.ttl),
        domain: cookie.domain,
        maxAgeSeconds: cookie.ttl,
        httpOnly: true,
        secure,
        sameSite,
        path: "/",
      });
    }
  }
}

/**
 * Applies a handler result to a response.
 *
 * Cookies are written before the body.
 *
 * A failure carrying `errorBody` is the auth API's own body and goes out
 * untouched; callers read fields off it. A failure carrying `errorCode` is this
 * package's own and is rendered as `{ error, details }`.
 */
export function applyResult(
  result: AppliableResult,
  adapter: ResponseAdapter,
  opts: CookieSecurityOptions,
): void {
  applyCookies(result, adapter, opts);

  if (result.errorBody !== undefined) {
    adapter.send(result.status, result.errorBody);
    return;
  }

  if (result.errorCode !== undefined) {
    adapter.send(
      result.status,
      result.details === undefined
        ? { error: result.errorCode }
        : { error: result.errorCode, details: result.details },
    );
    return;
  }

  adapter.send(result.status, result.body);
}
