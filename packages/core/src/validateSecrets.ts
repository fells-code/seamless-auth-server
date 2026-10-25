export const MIN_SECRET_LENGTH = 32;

/**
 * Example values that have shipped in starters and docs. Each is long enough to
 * pass the length check, so a deployment that kept one would otherwise boot.
 */
export const KNOWN_PLACEHOLDER_SECRETS: readonly string[] = [
  "dev-only-cookie-signing-key-replace-me",
  "GRAB_FROM_SEAMLESS_AUTH_PORTAL_DEV",
];

export interface SecretStrengthOptions {
  /**
   * Accept a known placeholder value. Only the adapter's insecure local mode
   * (`cookieSecure: false`) sets this.
   */
  allowPlaceholder?: boolean;
}

export function isPlaceholderSecret(value: string): boolean {
  return (
    KNOWN_PLACEHOLDER_SECRETS.includes(value) ||
    value.toLowerCase().includes("replace-me")
  );
}

export function assertSecretStrength(
  name: string,
  value: unknown,
  options: SecretStrengthOptions = {},
): void {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing ${name}`);
  }

  if (value.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `${name} must be at least ${MIN_SECRET_LENGTH} characters. A short secret can be brute forced offline, letting an attacker forge cookie sessions and service tokens. Generate one with: openssl rand -base64 48`,
    );
  }

  if (!options.allowPlaceholder && isPlaceholderSecret(value)) {
    throw new Error(
      `${name} is a published placeholder value. Anyone who has read the example can forge cookie sessions and service tokens with it. Generate one with: openssl rand -base64 48 (a placeholder is accepted only with cookieSecure: false, for local HTTP development)`,
    );
  }
}

/**
 * Checks both adapter secrets. A placeholder is refused unless the adapter runs
 * in its insecure local mode, `cookieSecure: false`, or `options` allows it.
 */
export function assertSecrets(
  opts: {
    cookieSecret: unknown;
    serviceSecret: unknown;
    cookieSecure?: boolean;
  },
  options: SecretStrengthOptions = {},
): void {
  const strength = {
    allowPlaceholder: options.allowPlaceholder || opts.cookieSecure === false,
  };

  assertSecretStrength("cookieSecret", opts.cookieSecret, strength);
  assertSecretStrength("serviceSecret", opts.serviceSecret, strength);
}
