// Signs like the auth API (Standard Webhooks v1), for adapter tests. Written
// against the spec, not imported from the verifier under test.
import { createHmac } from "node:crypto";

export const WEBHOOK_SECRET = "whsec_AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA=";
export const NEXT_WEBHOOK_SECRET =
  "whsec_ZWZnaGlqa2xtbm9wcXJzdHV2d3h5ent8fX5/gIGCg4Q=";

// Spaces and a non-ASCII name, so anything but the exact bytes fails to verify.
export const WEBHOOK_BODY =
  '{ "id": "evt_01", "type": "user.created", "version": 1, "timestamp": "2026-01-01T00:00:00.000Z", "data": { "userId": "user_01", "email": "zoë@example.com", "phone": null } }';

export function signedHeaders(body, secrets = [WEBHOOK_SECRET], id = "evt_01") {
  const timestamp = Math.floor(Date.now() / 1000);
  const signed = Buffer.concat([Buffer.from(`${id}.${timestamp}.`), Buffer.from(body)]);
  return {
    "webhook-id": id,
    "webhook-timestamp": String(timestamp),
    "webhook-signature": secrets
      .map((secret) => {
        const key = Buffer.from(secret.slice("whsec_".length), "base64");
        return `v1,${createHmac("sha256", key).update(signed).digest("base64")}`;
      })
      .join(" "),
  };
}
