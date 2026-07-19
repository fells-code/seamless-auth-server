export const MIN_SECRET_LENGTH = 32;

const DEV_JWKS_KID = "dev-main";

export function assertSecretStrength(name: string, value: unknown): void {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing ${name}`);
  }

  if (value.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `${name} must be at least ${MIN_SECRET_LENGTH} characters. A short secret can be brute forced offline, letting an attacker forge cookie sessions and service tokens. Generate one with: openssl rand -base64 48`,
    );
  }
}

export function assertSecrets(opts: {
  cookieSecret: unknown;
  serviceSecret: unknown;
}): void {
  assertSecretStrength("cookieSecret", opts.cookieSecret);
  assertSecretStrength("serviceSecret", opts.serviceSecret);
}

export function warnOnDevJwksKid(jwksKid: string | undefined): void {
  if (!jwksKid || jwksKid === DEV_JWKS_KID) {
    console.warn(
      `[SEAMLESS-AUTH-EXPRESS] - jwksKid is not set and defaults to "${DEV_JWKS_KID}". Set jwksKid explicitly to the active JWKS key id before deploying.`,
    );
  }
}

export { DEV_JWKS_KID };
