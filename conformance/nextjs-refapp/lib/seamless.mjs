// Configuration follows verify/CONFORMANCE.md in fells-code/seamless-cli. Read
// on the first request, not at import: `next build` loads every route module,
// and the adapter refuses to start without its secrets.
import { createSeamlessAuthHandler, requireAuth } from "@seamless-auth/nextjs";

const store = (globalThis.__seamlessRefapp ??= { captured: new Map() });

export const captured = store.captured;

const ok = (channel) => ({ accepted: true, provider: "capture", channel });

const handlers = {
  async sendOtpEmail({ to, token }) {
    captured.set(to, { token: String(token) });
    return ok("email");
  },
  async sendOtpSms({ to, token }) {
    captured.set(to, { token: String(token) });
    return ok("sms");
  },
  async sendMagicLinkEmail({ to, token, magicLinkUrl }) {
    captured.set(to, { token, magicLinkUrl });
    return ok("email");
  },
  async sendBootstrapInviteEmail({ to, token, inviteUrl }) {
    captured.set(to, { token, inviteUrl });
    return ok("email");
  },
};

function options() {
  const issuer = process.env.AUTH_SERVER_ISSUER ?? process.env.AUTH_SERVER_URL;

  return {
    authServerUrl: process.env.AUTH_SERVER_URL,
    authServerIssuer: issuer,
    audience: issuer,
    cookieSecret: process.env.COOKIE_SIGNING_KEY,
    serviceSecret: process.env.SEAMLESS_SERVICE_TOKEN,
    jwksKid: process.env.JWKS_KID,
    // The harness is the only peer and sends each virtual user with its own
    // X-Forwarded-For, so loopback is the one trusted hop.
    trustedProxies: ["127.0.0.1", "::1"],
    messaging: { handlers, defaults: { appName: "Seamless Verify" } },
  };
}

export function authHandlers() {
  return (store.handlers ??= createSeamlessAuthHandler(options()));
}

export function guarded(handler) {
  let route;
  return (request, context) => {
    route ??= requireAuth(handler, options());
    return route(request, context);
  };
}
