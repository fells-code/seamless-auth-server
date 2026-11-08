import express, {
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from "express";
import {
  verifyWebhook,
  WebhookVerificationError,
  type VerifyWebhookOptions,
  type WebhookEvent,
} from "@seamless-auth/core/webhook";

export {
  verifyWebhook,
  WebhookVerificationError,
} from "@seamless-auth/core/webhook";
export type {
  VerifyWebhookOptions,
  WebhookEvent,
  WebhookEventType,
  WebhookHeaders,
  WebhookVerificationReason,
} from "@seamless-auth/core/webhook";

declare global {
  namespace Express {
    interface Request {
      /** Set by `requireWebhook` once the signature verifies. */
      webhook?: WebhookEvent;
    }
  }
}

export interface RequireWebhookOptions extends VerifyWebhookOptions {
  /** Largest body read, in the `express.raw` format. Defaults to `"1mb"`. */
  limit?: string | number;
}

/**
 * Verifies a Seamless webhook and puts the typed event on `req.webhook`.
 *
 * Reads the body itself with `express.raw`, because the signature covers the
 * exact bytes. Mount it before any `express.json()` that would see the route:
 * a body parsed already cannot be verified, and the request fails with a
 * `TypeError` passed to `next`. A refused webhook gets
 * `400 { error: "invalid_webhook", reason }`.
 *
 * ### Example
 * ```ts
 * app.post(
 *   "/webhooks/seamless",
 *   requireWebhook({ secret: process.env.SEAMLESS_WEBHOOK_SECRET! }),
 *   (req, res) => {
 *     if (req.webhook!.type === "user.created") provision(req.webhook!.data.userId);
 *     res.sendStatus(204);
 *   },
 * );
 * app.use(express.json());
 * ```
 */
export function requireWebhook(options: RequireWebhookOptions): RequestHandler {
  const { limit = "1mb", ...verifyOptions } = options;
  const raw = express.raw({ type: () => true, limit });
  const verify = (req: Request, res: Response, next: NextFunction) => {
    try {
      // express.raw leaves req.body unset when the request has no body.
      req.webhook = verifyWebhook(req.body ?? "", req.headers, verifyOptions);
    } catch (err) {
      if (err instanceof WebhookVerificationError) {
        res.status(400).json({ error: "invalid_webhook", reason: err.reason });
        return;
      }
      next(err);
      return;
    }
    next();
  };
  return (req, res, next) =>
    raw(req, res, (err?: unknown) => (err ? next(err) : verify(req, res, next)));
}
