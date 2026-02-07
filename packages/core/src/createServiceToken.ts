import jwt from "jsonwebtoken";

export interface ServiceTokenOptions {
  issuer: string;
  audience: string;
  subject: string;
  refreshToken?: string;
  serviceSecret: string;
  keyId: string;
}

export function createServiceToken(opts: ServiceTokenOptions): string {
  return jwt.sign(
    {
      iss: opts.issuer,
      aud: opts.audience,
      sub: opts.subject,
      refreshToken: opts.refreshToken,
      iat: Math.floor(Date.now() / 1000),
    },
    opts.serviceSecret,
    {
      expiresIn: "60s",
      algorithm: "HS256",
      keyid: opts.keyId,
    },
  );
}
