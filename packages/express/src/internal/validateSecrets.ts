export {
  MIN_SECRET_LENGTH,
  assertSecretStrength,
  assertSecrets,
} from "@seamless-auth/core";

import { DEV_JWKS_KID } from "@seamless-auth/core";

export function warnOnDevJwksKid(jwksKid: string | undefined): void {
  if (!jwksKid || jwksKid === DEV_JWKS_KID) {
    console.warn(
      `[SEAMLESS-AUTH-EXPRESS] - jwksKid is not set and defaults to "${DEV_JWKS_KID}". Set jwksKid explicitly to the active JWKS key id before deploying.`,
    );
  }
}

export { DEV_JWKS_KID };
