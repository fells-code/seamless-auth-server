import { createHmac, timingSafeEqual } from "node:crypto";

import { WebhookEventSchema, type WebhookEvent } from "@seamless-auth/types";
import {
  WEBHOOK_ID_HEADER,
  WEBHOOK_SECRET_PREFIX,
  WEBHOOK_SIGNATURE_HEADER,
  WEBHOOK_SIGNATURE_VERSION,
  WEBHOOK_TIMESTAMP_HEADER,
  WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS,
} from "@seamless-auth/types/webhook/constants";

export type { WebhookEvent, WebhookEventType } from "@seamless-auth/types";
export {
  WEBHOOK_ID_HEADER,
  WEBHOOK_SIGNATURE_HEADER,
  WEBHOOK_TIMESTAMP_HEADER,
  WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS,
};

/**
 * Why a webhook was refused.
 *
 * - `missing_header`: `webhook-id`, `webhook-timestamp` or `webhook-signature` is absent.
 * - `malformed_header`: a header is repeated, empty, or not in the expected form.
 * - `timestamp_out_of_tolerance`: `webhook-timestamp` is more than 300 s from this clock, either way.
 * - `unsupported_version`: no signature in the header is a `v1` signature.
 * - `invalid_signature`: no `v1` signature matches any configured secret.
 * - `invalid_payload`: the signature verified but the body is not a known Seamless event.
 */
export type WebhookVerificationReason =
  | "missing_header"
  | "malformed_header"
  | "timestamp_out_of_tolerance"
  | "unsupported_version"
  | "invalid_signature"
  | "invalid_payload";

export class WebhookVerificationError extends Error {
  readonly reason: WebhookVerificationReason;

  constructor(reason: WebhookVerificationReason, message: string) {
    super(message);
    this.name = "WebhookVerificationError";
    this.reason = reason;
  }
}

/** Fetch `Headers`, or Node's `IncomingHttpHeaders` and anything shaped like it. */
export type WebhookHeaders =
  | Headers
  | Record<string, string | string[] | undefined>;

export interface VerifyWebhookOptions {
  /**
   * The endpoint's signing secret (`whsec_...`), or two while it rotates: the
   * new one and the one it replaces.
   */
  secret: string | readonly string[];
}

const SIGNATURE_BYTES = 32;

function secretKeys(secret: string | readonly string[]): Buffer[] {
  const secrets = typeof secret === "string" ? [secret] : [...secret];
  if (secrets.length < 1 || secrets.length > 2) {
    throw new TypeError(
      "verifyWebhook takes one webhook secret, or two while it rotates",
    );
  }
  return secrets.map((value) => {
    const encoded =
      typeof value === "string" && value.startsWith(WEBHOOK_SECRET_PREFIX)
        ? value.slice(WEBHOOK_SECRET_PREFIX.length)
        : "";
    const key = Buffer.from(encoded, "base64");
    if (key.length === 0 || key.toString("base64") !== encoded) {
      throw new TypeError(
        `A webhook secret is "${WEBHOOK_SECRET_PREFIX}" followed by base64`,
      );
    }
    return key;
  });
}

function readHeader(headers: WebhookHeaders, name: string): string {
  let value: string | string[] | null | undefined;
  if (typeof (headers as Headers).get === "function") {
    value = (headers as Headers).get(name);
  } else {
    const record = headers as Record<string, string | string[] | undefined>;
    const key = Object.keys(record).find((k) => k.toLowerCase() === name);
    value = key === undefined ? undefined : record[key];
  }

  if (value === undefined || value === null) {
    throw new WebhookVerificationError(
      "missing_header",
      `Missing ${name} header`,
    );
  }
  if (typeof value !== "string" || value.trim() === "") {
    throw new WebhookVerificationError(
      "malformed_header",
      `Malformed ${name} header`,
    );
  }
  return value.trim();
}

function rawBytes(rawBody: unknown): Buffer {
  if (typeof rawBody === "string") return Buffer.from(rawBody, "utf8");
  if (rawBody instanceof Uint8Array) return Buffer.from(rawBody);
  // A parsed object cannot be verified: re-serializing it changes the bytes.
  throw new TypeError(
    "verifyWebhook needs the raw request body as a string or bytes, not parsed JSON",
  );
}

/**
 * Verifies a Seamless webhook (Standard Webhooks, `v1` HMAC-SHA256) and returns
 * the typed event.
 *
 * Pass the body exactly as received. The signature covers
 * `${webhook-id}.${webhook-timestamp}.${body}`, so a body that was parsed and
 * serialized again does not verify. The event is parsed only after the
 * signature verifies.
 *
 * Throws `WebhookVerificationError`, with a `reason`, when the request is
 * refused, and `TypeError` when the secret or body is not usable at all.
 * Delivery is at least once: dedupe on `event.id`, which equals `webhook-id`.
 *
 * ### Example
 * ```ts
 * const event = verifyWebhook(rawBody, request.headers, {
 *   secret: process.env.SEAMLESS_WEBHOOK_SECRET!,
 * });
 * if (event.type === "user.created") provision(event.data.userId);
 * ```
 */
export function verifyWebhook(
  rawBody: string | Uint8Array,
  headers: WebhookHeaders,
  options: VerifyWebhookOptions,
): WebhookEvent {
  const keys = secretKeys(options.secret);
  const body = rawBytes(rawBody);

  const id = readHeader(headers, WEBHOOK_ID_HEADER);
  const timestampHeader = readHeader(headers, WEBHOOK_TIMESTAMP_HEADER);
  const signatureHeader = readHeader(headers, WEBHOOK_SIGNATURE_HEADER);

  if (!/^\d{1,15}$/.test(timestampHeader)) {
    throw new WebhookVerificationError(
      "malformed_header",
      `Malformed ${WEBHOOK_TIMESTAMP_HEADER} header`,
    );
  }
  const timestamp = Number(timestampHeader);
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS) {
    throw new WebhookVerificationError(
      "timestamp_out_of_tolerance",
      `${WEBHOOK_TIMESTAMP_HEADER} is outside the ${WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS} s tolerance`,
    );
  }

  const candidates: Buffer[] = [];
  let sawVersion = false;
  for (const entry of signatureHeader.split(" ")) {
    if (entry === "") continue;
    const comma = entry.indexOf(",");
    if (comma <= 0 || comma === entry.length - 1) {
      throw new WebhookVerificationError(
        "malformed_header",
        `Malformed ${WEBHOOK_SIGNATURE_HEADER} header`,
      );
    }
    if (entry.slice(0, comma) !== WEBHOOK_SIGNATURE_VERSION) continue;
    sawVersion = true;
    const decoded = Buffer.from(entry.slice(comma + 1), "base64");
    if (decoded.length === SIGNATURE_BYTES) {
      candidates.push(decoded);
    }
  }
  if (!sawVersion) {
    throw new WebhookVerificationError(
      "unsupported_version",
      `${WEBHOOK_SIGNATURE_HEADER} holds no ${WEBHOOK_SIGNATURE_VERSION} signature`,
    );
  }

  const signed = Buffer.concat([Buffer.from(`${id}.${timestampHeader}.`), body]);
  let verified = false;
  for (const key of keys) {
    const expected = createHmac("sha256", key).update(signed).digest();
    for (const candidate of candidates) {
      // No early exit, so the time taken does not say which entry matched.
      if (timingSafeEqual(expected, candidate)) verified = true;
    }
  }
  if (!verified) {
    throw new WebhookVerificationError(
      "invalid_signature",
      "No webhook signature matches the configured secret",
    );
  }

  let json: unknown;
  try {
    json = JSON.parse(body.toString("utf8"));
  } catch {
    throw new WebhookVerificationError(
      "invalid_payload",
      "The webhook body is not JSON",
    );
  }
  const parsed = WebhookEventSchema.safeParse(json);
  if (!parsed.success) {
    throw new WebhookVerificationError(
      "invalid_payload",
      "The webhook body is not a known Seamless event",
    );
  }
  return parsed.data;
}
