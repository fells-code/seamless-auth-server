export {
  MIN_SECRET_LENGTH,
  assertSecretStrength,
  assertSecrets,
} from "@seamless-auth/core";

import { DEV_JWKS_KID } from "@seamless-auth/core";

export function warnOnDevJwksKid(jwksKid: string | undefined): void {
  if (!jwksKid || jwksKid === DEV_JWKS_KID) {
    const state = jwksKid
      ? `is "${DEV_JWKS_KID}"`
      : `is not set and defaults to "${DEV_JWKS_KID}"`;
    console.warn(
      `[SEAMLESS-AUTH-EXPRESS] - jwksKid ${state}, a placeholder. It is the kid header on the HS256 service tokens this adapter signs with serviceSecret; set it to name that key explicitly.`,
    );
  }
}

export { DEV_JWKS_KID };
