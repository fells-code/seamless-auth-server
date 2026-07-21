import { verifyCookieJwt } from "./verifyCookieJwt.js";
import { refreshAccessToken } from "./refreshAccessToken.js";
import { assertSecrets } from "./validateSecrets.js";

export interface EnsureCookiesInput {
  path: string;
  cookies: Record<string, string | undefined>;
}

export interface CookiePayload {
  sub: string;
  sessionId?: string;
  token?: string;
  refreshToken?: string;
  roles?: string[];
  email?: string;
  phone?: string | null;
  organizationId?: string | null;
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
    sessionId?: string;
    token?: string;
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
  forwardedClientIp?: string;
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
  "/otp/generate-email-otp": {
    name: "registrationCookieName",
    required: true,
  },
  "/otp/generate-phone-otp": {
    name: "registrationCookieName",
    required: true,
  },
  "/otp/verify-login-email-otp": {
    name: "preAuthCookieName",
    required: true,
  },
  "/otp/verify-login-phone-otp": {
    name: "preAuthCookieName",
    required: true,
  },
  "/otp/generate-login-email-otp": {
    name: "preAuthCookieName",
    required: true,
  },
  "/otp/generate-login-phone-otp": {
    name: "preAuthCookieName",
    required: true,
  },
  // The token in "/magic-link/verify/:token" is itself the credential, so a
  // link opened on a different device (no pre-auth or refresh cookie) must not
  // be gated. This entry must precede "/magic-link" so the prefix-match find()
  // below selects it first.
  "/magic-link/verify": {
    name: "preAuthCookieName",
    required: false,
  },
  // Must precede "/magic-link" for the same prefix-match reason; otherwise this
  // entry is shadowed and would silently stop applying if its config diverged.
  "/magic-link/check": {
    name: "preAuthCookieName",
    required: true,
  },
  "/magic-link": {
    name: "preAuthCookieName",
    required: true,
  },
  "/logout/all": { name: "accessCookieName", required: true },
  "/logout": { name: "accessCookieName", required: true },
  "/users/me": { name: "accessCookieName", required: true },
  "/users/update": { name: "accessCookieName", required: true },
  "/users/credentials": { name: "accessCookieName", required: true },
  "/sessions": { name: "accessCookieName", required: true },
  "/organizations": { name: "accessCookieName", required: true },
  "/step-up/status": { name: "accessCookieName", required: true },
  "/step-up/webauthn/start": { name: "accessCookieName", required: true },
  "/step-up/webauthn/finish": { name: "accessCookieName", required: true },
  "/totp/status": { name: "accessCookieName", required: true },
  "/totp/enroll/start": { name: "accessCookieName", required: true },
  "/totp/enroll/verify": { name: "accessCookieName", required: true },
  "/totp/disable": { name: "accessCookieName", required: true },
  "/totp/verify-mfa": { name: "accessCookieName", required: true },
  "/internal/metrics/dashboard": { name: "accessCookieName", required: true },
  "/internal/auth-events/summary": {
    name: "accessCookieName",
    required: true,
  },
  "/internal/auth-events/timeseries": {
    name: "accessCookieName",
    required: true,
  },

  "/internal/auth-events/grouped": { name: "accessCookieName", required: true },
  "/internal/auth-events/login-stats": {
    name: "accessCookieName",
    required: true,
  },

  "/internal/security/anomalies": { name: "accessCookieName", required: true },

  "/admin/user": {
    name: "accessCookieName",
    required: true,
  },
  "/admin/credential-count": {
    name: "accessCookieName",
    required: true,
  },
  "/admin/sessions": {
    name: "accessCookieName",
    required: true,
  },
  "/admin/auth-events": {
    name: "accessCookieName",
    required: true,
  },
  "/admin/organizations": {
    name: "accessCookieName",
    required: true,
  },

  "/system-config/admin": {
    name: "accessCookieName",
    required: true,
  },

  // Prefix match covers both the collection and the id-scoped provider routes.
  "/system-config/oauth-providers": {
    name: "accessCookieName",
    required: true,
  },

  "/system-config/roles": {
    name: "accessCookieName",
    required: true,
  },
};

async function refreshRequiredCookie(
  cookieName: string,
  refreshCookie: string | undefined,
  opts: EnsureCookiesOptions,
): Promise<EnsureCookiesResult | null> {
  if (!refreshCookie) {
    return null;
  }

  const refreshed = await refreshAccessToken(refreshCookie, {
    authServerUrl: opts.authServerUrl,
    cookieSecret: opts.cookieSecret,
    serviceSecret: opts.serviceSecret,
    issuer: opts.issuer,
    audience: opts.audience,
    keyId: opts.keyId,
    forwardedClientIp: opts.forwardedClientIp,
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
      ...(refreshed.sessionId === undefined
        ? {}
        : { sessionId: refreshed.sessionId }),
      token: refreshed.token,
      roles: refreshed.roles,
    },
    setCookies: [
      {
        name: cookieName,
        value: {
          sub: refreshed.sub,
          ...(refreshed.sessionId === undefined
            ? {}
            : { sessionId: refreshed.sessionId }),
          token: refreshed.token,
          roles: refreshed.roles,
          email: refreshed.email,
          phone: refreshed.phone,
          organizationId: refreshed.organizationId ?? null,
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

export async function ensureCookies(
  input: EnsureCookiesInput,
  opts: EnsureCookiesOptions,
): Promise<EnsureCookiesResult> {
  assertSecrets(opts);

  // Match case-insensitively: Express route matching is case-insensitive by
  // default, so a client may send a path whose casing differs from the mounted
  // route (e.g. "/webauthn/..." vs "/webAuthn/..."). A case-sensitive miss here
  // would silently skip cookie loading and break the request downstream, so the
  // comparison is normalized to lower case on both sides.
  const requestPath = input.path.toLowerCase();
  const match = Object.entries(COOKIE_REQUIREMENTS).find(([path]) =>
    requestPath.startsWith(path.toLowerCase()),
  );

  if (!match) {
    return { type: "ok" };
  }

  const [, { name, required }] = match;

  // A not-required entry marks a route that is explicitly ungated: it must pass
  // through regardless of which cookies are (or are not) present, so a stale or
  // absent cookie never blocks it.
  if (!required) {
    return { type: "ok" };
  }

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
    const refreshed = await refreshRequiredCookie(cookieName, refreshCookie, opts);

    if (!refreshed) {
      return {
        type: "error",
        status: 400,
        error: `Missing required cookie "${cookieName}"`,
      };
    }

    return refreshed;
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

    const token = typeof payload.token === "string" ? payload.token : undefined;

    if (required && !token && cookieName === opts.accessCookieName) {
      const refreshed = await refreshRequiredCookie(cookieName, refreshCookie, opts);

      if (refreshed) {
        return refreshed;
      }
    }

    if (required && !token) {
      return {
        type: "error",
        status: 401,
        error: `Invalid or expired ${cookieName} cookie`,
        clearCookies: [cookieName],
      };
    }

    return {
      type: "ok",
      user: {
        sub: payload.sub as string,
        ...(typeof payload.sessionId === "string"
          ? { sessionId: payload.sessionId }
          : {}),
        ...(token === undefined ? {} : { token }),
        roles: payload.roles as string[] | undefined,
      },
    };
  }

  return { type: "ok" };
}
