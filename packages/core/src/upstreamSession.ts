import type { SessionCookie } from "./applyResult.js";
import type { AuthTransport } from "./transport.js";
import { verifySignedAuthResponse } from "./verifySignedAuthResponse.js";

/**
 * What the auth API returns when it issues a session.
 *
 * The handlers read these fields off the parsed response, which was untyped
 * before: a rename upstream showed up as an undefined cookie field at runtime
 * rather than a type error here.
 *
 * The index signature is deliberate. Several handlers forward the whole body to
 * the caller, so it carries more than the fields this package reads, and the
 * type should not claim otherwise.
 */
export interface UpstreamSessionResponse {
  sub: string;
  token: string;
  refreshToken?: string;
  roles?: string[];
  email?: string;
  phone?: string | null;
  organizationId?: string | null;
  ttl: number;
  refreshTtl?: number;
  [key: string]: unknown;
}

/**
 * The response body minus the credentials the cookies now carry.
 *
 * The access and refresh tokens go out as `httpOnly` cookies precisely so that
 * page scripts cannot read them. Returning the upstream body unchanged handed the
 * same two values straight back to the caller in the response that set those
 * cookies, which put them everywhere a body goes and a cookie does not: a devtools
 * export, a service worker, an APM tool that records payloads, a proxy logging
 * bodies.
 *
 * Everything else survives. Callers read `message`, `email`, `roles`,
 * `organizationId` and `returnTo` off these responses, so this removes the
 * credentials rather than the body.
 */
export function withoutSessionMaterial<T extends UpstreamSessionResponse>(data: T) {
  const { token: _token, refreshToken: _refreshToken, ...rest } = data;

  return rest;
}

export interface VerifiedUpstreamSession {
  /** The `sid` claim, when the access token carries one. */
  sessionId?: string;
}

/**
 * Verifies the access token the auth API signed and confirms it describes the
 * same subject as the response body.
 *
 * Throws rather than returning a failure: a response that fails either check is
 * not a rejected login, it is a response this package cannot trust, and
 * continuing would mint a session from it.
 */
export async function verifyUpstreamSession(
  data: UpstreamSessionResponse,
  authServerUrl: string,
  audience: string,
): Promise<VerifiedUpstreamSession> {
  const verified = await verifySignedAuthResponse(
    data.token,
    authServerUrl,
    audience,
  );

  if (!verified) {
    throw new Error("Invalid signed response from Auth Server");
  }

  if (verified.sub !== data.sub) {
    throw new Error("Signature mismatch with data payload");
  }

  return {
    sessionId: typeof verified.sid === "string" ? verified.sid : undefined,
  };
}

export interface IssueSessionCookiesOptions {
  authServerUrl: string;
  audience: string;
  accessCookieName: string;
  /** Omit for a flow that reissues the access cookie without rotating refresh. */
  refreshCookieName?: string;
  cookieDomain?: string;
}

/**
 * Verifies an upstream session response and builds the cookies for it.
 *
 * One place decides what a session cookie holds, so the flows that issue one
 * cannot disagree about it.
 */
export async function issueSessionCookies(
  data: UpstreamSessionResponse,
  opts: IssueSessionCookiesOptions,
): Promise<SessionCookie[]> {
  const { sessionId } = await verifyUpstreamSession(
    data,
    opts.authServerUrl,
    opts.audience,
  );

  const cookies: SessionCookie[] = [
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
  ];

  if (opts.refreshCookieName) {
    cookies.push({
      name: opts.refreshCookieName,
      value: { sub: data.sub, refreshToken: data.refreshToken },
      ttl: data.refreshTtl as number,
      domain: opts.cookieDomain,
    });
  }

  return cookies;
}

export interface SessionResultOptions extends IssueSessionCookiesOptions {
  transport?: AuthTransport;
}

export interface SessionResult {
  body: unknown;
  setCookies?: SessionCookie[];
}

/**
 * Turns an upstream session response into what a handler returns for it, in
 * whichever transport the request arrived on.
 *
 * Cookie transport strips the tokens out of the body and carries them in
 * cookies. Bearer transport hands the body back whole, tokens included, because
 * the client is the one holding them. The upstream token is verified either
 * way: a body this package is about to vouch for is checked before it goes out,
 * whether or not a cookie is minted from it.
 */
export async function sessionResult(
  data: UpstreamSessionResponse,
  opts: SessionResultOptions,
): Promise<SessionResult> {
  if (opts.transport === "bearer") {
    await verifyUpstreamSession(data, opts.authServerUrl, opts.audience);
    return { body: data };
  }

  return {
    body: withoutSessionMaterial(data),
    setCookies: await issueSessionCookies(data, opts),
  };
}
