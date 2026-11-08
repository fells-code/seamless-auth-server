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

/**
 * Reads the request body as raw bytes and verifies it as a Seamless webhook.
 * Throws `WebhookVerificationError` when it is refused. The body can be read
 * once, so do not call `request.json()` first.
 */
export async function verifyWebhookRequest(
  request: Request,
  options: VerifyWebhookOptions,
): Promise<WebhookEvent> {
  const body = new Uint8Array(await request.arrayBuffer());
  return verifyWebhook(body, request.headers, options);
}

export interface WebhookHandlerOptions extends VerifyWebhookOptions {
  /** Handles a verified event. Return a `Response` to answer; otherwise 204. */
  onEvent: (
    event: WebhookEvent,
    request: Request,
  ) => Response | void | Promise<Response | void>;
}

/**
 * A route handler for `app/.../route.ts` that verifies a Seamless webhook and
 * passes the typed event to `onEvent`. A refused webhook gets
 * `400 { error: "invalid_webhook", reason }`. Runs on the Node.js runtime.
 *
 * ### Example
 * ```ts
 * export const POST = createWebhookHandler({
 *   secret: process.env.SEAMLESS_WEBHOOK_SECRET!,
 *   async onEvent(event) {
 *     if (event.type === "user.created") await provision(event.data.userId);
 *   },
 * });
 * ```
 */
export function createWebhookHandler(options: WebhookHandlerOptions) {
  const { onEvent, ...verifyOptions } = options;
  return async (request: Request): Promise<Response> => {
    let event: WebhookEvent;
    try {
      event = await verifyWebhookRequest(request, verifyOptions);
    } catch (err) {
      if (err instanceof WebhookVerificationError) {
        return Response.json(
          { error: "invalid_webhook", reason: err.reason },
          { status: 400 },
        );
      }
      throw err;
    }
    return (await onEvent(event, request)) ?? new Response(null, { status: 204 });
  };
}
