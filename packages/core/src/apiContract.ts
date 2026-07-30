import { createServiceToken } from "./createServiceToken.js";

/**
 * Values the auth API defines. Changing one of these is a coordinated change
 * with `seamless-auth-api`, so they live here rather than being written out at
 * each call site, and every adapter reads the same value.
 */

/**
 * Asks the auth API to return a delivery payload instead of sending the message
 * itself, so the adopter's own transports deliver it.
 */
export const AUTH_DELIVERY_MODE_HEADER = "x-seamless-auth-delivery-mode";
export const EXTERNAL_DELIVERY_MODE = "external";

/** Headers that request external delivery, spreadable into an `authFetch` call. */
export const EXTERNAL_DELIVERY_HEADERS: Readonly<Record<string, string>> =
  Object.freeze({
    [AUTH_DELIVERY_MODE_HEADER]: EXTERNAL_DELIVERY_MODE,
  });

/**
 * The auth API validates machine-to-machine service tokens against a fixed
 * issuer and audience. These are not the adopter's configured audience, which
 * applies to user tokens: a service token signed with the adopter's audience is
 * rejected.
 */
export const SERVICE_TOKEN_ISSUER = "seamless-portal-api";
export const SERVICE_TOKEN_AUDIENCE = "seamless-auth";

/**
 * Fallback JWKS key id. Deploying on it is a misconfiguration, and adapters
 * warn when it is in use.
 */
export const DEV_JWKS_KID = "dev-main";

/**
 * Subject for the token that authorizes an external-delivery request. It names
 * the caller's role rather than a browser user, because no user is involved:
 * the adapter is telling the API to hand back a payload instead of sending it.
 */
export const EXTERNAL_DELIVERY_TOKEN_SUBJECT =
  "seamless-auth-external-delivery";

export interface ServiceIdentityOptions {
  serviceSecret: string;
  jwksKid?: string;
}

/**
 * Mints the `Authorization` value for an external-delivery request.
 */
export function buildExternalDeliveryAuthorization(
  opts: ServiceIdentityOptions,
): string {
  return `Bearer ${createServiceToken({
    subject: EXTERNAL_DELIVERY_TOKEN_SUBJECT,
    issuer: SERVICE_TOKEN_ISSUER,
    audience: SERVICE_TOKEN_AUDIENCE,
    serviceSecret: opts.serviceSecret,
    keyId: opts.jwksKid || DEV_JWKS_KID,
  })}`;
}
