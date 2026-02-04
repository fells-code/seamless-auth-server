import { verifyCookieJwt } from "./verifyCookieJwt.js";
import { refreshAccessToken } from "./refreshAccessToken.js";

export interface EnsureCookiesInput {
  path: string;
  cookies: Record<string, string | undefined>;
}

export interface CookiePayload {
  sub: string;
  token?: string;
  refreshToken?: string;
  roles?: string[];
}

export interface CookieInstruction {
  name: string;
  value: CookiePayload;
  ttl: number;
  domain?: string;
}

export interface EnsureCookiesResult {
  type: "ok" | "error";
  status?: number;
  error?: string;
  user?: {
    sub: string;
    roles?: string[];
  };
  setCookies?: CookieInstruction[];
  clearCookies?: string[];
}

export interface EnsureCookiesOptions {
  authServerUrl: string;
  cookieDomain?: string;
  accessCookieName: string;
  registrationCookieName: string;
  refreshCookieName: string;
  preAuthCookieName: string;
  cookieSecret: string;
  serviceSecret: string;
  issuer: string;
  audience: string;
  keyId: string;
}

const COOKIE_REQUIREMENTS: Record<
  string,
  { name: keyof EnsureCookiesOptions; required: boolean }
> = {
  "/webAuthn/login/finish": { name: "preAuthCookieName", required: true },
  "/webAuthn/login/start": { name: "preAuthCookieName", required: true },
  "/webAuthn/register/start": {
    name: "registrationCookieName",
    required: true,
  },
  "/webAuthn/register/finish": {
    name: "registrationCookieName",
    required: true,
  },
  "/otp/verify-email-otp": {
    name: "registrationCookieName",
    required: true,
  },
  "/otp/verify-phone-otp": {
    name: "registrationCookieName",
    required: true,
  },
  "/logout": { name: "accessCookieName", required: true },
  "/users/me": { name: "accessCookieName", required: true },
};

export async function ensureCookies(
  input: EnsureCookiesInput,
  opts: EnsureCookiesOptions,
): Promise<EnsureCookiesResult> {
  const match = Object.entries(COOKIE_REQUIREMENTS).find(([path]) =>
    input.path.startsWith(path),
  );

  if (!match) {
    return { type: "ok" };
  }

  const [, { name, required }] = match;
  const cookieName = opts[name];

  if (!cookieName) {
    return {
      type: "error",
      status: 400,
      error: "Missing required cookie",
    };
  }
  const cookieValue = input.cookies[cookieName];
  const refreshCookie = input.cookies[opts.refreshCookieName];

  if (required && !cookieValue) {
    if (!refreshCookie) {
      return {
        type: "error",
        status: 400,
        error: `Missing required cookie "${cookieName}"`,
      };
    }

    const refreshed = await refreshAccessToken(refreshCookie, {
      authServerUrl: opts.authServerUrl,
      cookieSecret: opts.cookieSecret,
      serviceSecret: opts.serviceSecret,
      issuer: opts.issuer,
      audience: opts.audience,
      keyId: opts.keyId,
    });

    if (!refreshed?.token) {
      return {
        type: "error",
        status: 401,
        error: "Refresh failed",
        clearCookies: [
          cookieName,
          opts.registrationCookieName,
          opts.refreshCookieName,
        ],
      };
    }

    return {
      type: "ok",
      user: {
        sub: refreshed.sub,
        roles: refreshed.roles,
      },
      setCookies: [
        {
          name: cookieName,
          value: {
            sub: refreshed.sub,
            roles: refreshed.roles,
          },
          ttl: refreshed.ttl,
          domain: opts.cookieDomain,
        },
        {
          name: opts.refreshCookieName,
          value: {
            sub: refreshed.sub,
            refreshToken: refreshed.refreshToken,
          },
          ttl: refreshed.refreshTtl,
          domain: opts.cookieDomain,
        },
      ],
    };
  }

  if (cookieValue) {
    const payload = verifyCookieJwt(cookieValue, opts.cookieSecret);
    if (!payload) {
      return {
        type: "error",
        status: 401,
        error: `Invalid or expired ${cookieName} cookie`,
      };
    }

    return {
      type: "ok",
      user: {
        sub: payload.sub as string,
        roles: payload.roles as string[] | undefined,
      },
    };
  }

  return { type: "ok" };
}
