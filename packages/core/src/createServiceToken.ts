import jwt from "jsonwebtoken";

import { assertSecretStrength } from "./validateSecrets.js";

export interface ServiceTokenOptions {
  issuer: string;
  audience: string;
  subject: string;
  sessionId?: string;
  refreshToken?: string;
  serviceSecret: string;
  keyId: string;
}

export function createServiceToken(opts: ServiceTokenOptions): string {
  assertSecretStrength("serviceSecret", opts.serviceSecret);

  return jwt.sign(
    {
      iss: opts.issuer,
      aud: opts.audience,
      sub: opts.subject,
      ...(opts.sessionId === undefined ? {} : { sid: opts.sessionId }),
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
