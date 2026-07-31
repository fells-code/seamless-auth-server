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
  /**
   * The same lifetime as `maxAgeSeconds`, as an absolute time.
   *
   * Both are specified so every adapter emits the same header. `Max-Age` wins
   * wherever it is understood; `Expires` is the fallback for clients that do
   * not, which would otherwise treat the cookie as a session cookie. Leaving
   * this to the adapter is how two adapters end up issuing different cookies for
   * the same session.
   */
  expires: Date;
  httpOnly: boolean;
  secure: boolean;
  sameSite: CookieSameSite;
  path: string;
}

export interface ClearCookieCommand {
  name: string;
  domain?: string;
  /**
   * The epoch, which is what tells the browser to drop the cookie. Specified
   * here for the same reason as on the set path: so every adapter emits the
   * same header rather than each picking its own expression of "delete this".
   */
  expires: Date;
  secure: boolean;
  sameSite: CookieSameSite;
  path: string;
}

/** Any time in the past drops the cookie; the epoch is the conventional one. */
const COOKIE_EPOCH = new Date(0);

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

/**
 * Normalizes a cookie lifetime arriving from upstream.
 *
 * Handler results declare `ttl` as a number, but they populate it from a parsed
 * JSON body, which is untyped. When the value arrives as a numeric string the
 * declaration is simply wrong, and the two adapters then disagree: Express
 * multiplies it into milliseconds, which coerces it to a number and hides the
 * problem, while Fastify passes it through to `cookie`, whose `Number.isInteger`
 * check rejects it and fails the request. That is the difference between an
 * adapter working and an adapter throwing on the same upstream response, so it
 * is settled here rather than in either one.
 *
 * Anything that is not a positive whole number of seconds throws. A cookie is
 * the session, and emitting one with a lifetime nobody can vouch for is worse
 * than refusing the response.
 */
function toTtlSeconds(ttl: unknown): number {
  const seconds = typeof ttl === "string" ? Number(ttl) : ttl;

  if (typeof seconds !== "number" || !Number.isInteger(seconds) || seconds <= 0) {
    throw new Error(
      `Upstream returned an unusable cookie ttl: ${JSON.stringify(ttl)}`,
    );
  }

  return seconds;
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
        expires: COOKIE_EPOCH,
        secure,
        sameSite,
        path: "/",
      });
    }
  }

  if (result.setCookies?.length) {
    const secret = requireSecret(opts);

    const now = Date.now();

    for (const cookie of result.setCookies) {
      const ttlSeconds = toTtlSeconds(cookie.ttl);

      adapter.setCookie({
        name: cookie.name,
        value: signSessionCookie(cookie.value, secret, ttlSeconds),
        domain: cookie.domain,
        maxAgeSeconds: ttlSeconds,
        expires: new Date(now + ttlSeconds * 1000),
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
