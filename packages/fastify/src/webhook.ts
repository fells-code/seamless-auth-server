import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
} from "fastify";
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

export interface SeamlessWebhookOptions extends VerifyWebhookOptions {
  /** The route the webhook is POSTed to, such as `/webhooks/seamless`. */
  path: string;
  /** Largest body read, in bytes. Defaults to Fastify's `bodyLimit`. */
  bodyLimit?: number;
  /**
   * Handles a verified event. Return a value or send on `reply` to answer;
   * otherwise the route answers 204.
   */
  onEvent: (
    event: WebhookEvent,
    request: FastifyRequest,
    reply: FastifyReply,
  ) => unknown;
}

/**
 * Fastify plugin serving one webhook route. It replaces the JSON parser with a
 * raw buffer parser inside its own encapsulated context, because the signature
 * covers the exact bytes, so the rest of the app keeps parsing JSON. A refused
 * webhook gets `400 { error: "invalid_webhook", reason }`.
 *
 * Register it without `fastify-plugin`, or the raw parser leaks to every route.
 *
 * ### Example
 * ```ts
 * await app.register(seamlessWebhook, {
 *   path: "/webhooks/seamless",
 *   secret: process.env.SEAMLESS_WEBHOOK_SECRET!,
 *   async onEvent(event) {
 *     if (event.type === "user.created") await provision(event.data.userId);
 *   },
 * });
 * ```
 */
export async function seamlessWebhook(
  fastify: FastifyInstance,
  options: SeamlessWebhookOptions,
) {
  const { path, bodyLimit, onEvent, ...verifyOptions } = options;

  fastify.removeAllContentTypeParsers();
  fastify.addContentTypeParser(
    "*",
    { parseAs: "buffer", bodyLimit },
    (_request, body, done) => done(null, body),
  );

  fastify.post(path, async (request, reply) => {
    let event: WebhookEvent;
    try {
      event = verifyWebhook(
        (request.body as Buffer | undefined) ?? "",
        request.headers,
        verifyOptions,
      );
    } catch (err) {
      if (err instanceof WebhookVerificationError) {
        return reply
          .code(400)
          .send({ error: "invalid_webhook", reason: err.reason });
      }
      throw err;
    }

    const result = await onEvent(event, request, reply);
    if (reply.sent) return reply;
    if (result !== undefined) return result;
    return reply.code(204).send();
  });
}
