export const MIN_SECRET_LENGTH = 32;

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
