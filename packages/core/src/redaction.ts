const REDACTED = "[REDACTED]";

const SENSITIVE_TEXT_PATTERNS: Array<[RegExp, string]> = [
  [/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, REDACTED],
  [/\b(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, `$1${REDACTED}`],
  [/(\/magic-link\/verify\/)[^/?#\s]+/gi, `$1${REDACTED}`],
  [/([?&](?:token|bootstrapToken|state|code|salt)=)[^&#\s]+/gi, `$1${REDACTED}`],
  [/\b((?:token|bootstrapToken|verificationToken|identifier|phone|state|code|secret|salt)\s*[:=]\s*)[^,&\s}]+/gi, `$1${REDACTED}`],
  [/\b(client_secret=)[^&\s]+/gi, `$1${REDACTED}`],
];

export function redactSensitiveText(value: string) {
  return SENSITIVE_TEXT_PATTERNS.reduce(
    (current, [pattern, replacement]) => current.replace(pattern, replacement),
    value,
  );
}
