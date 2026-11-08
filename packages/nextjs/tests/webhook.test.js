import {
  NEXT_WEBHOOK_SECRET,
  WEBHOOK_BODY,
  WEBHOOK_SECRET,
  signedHeaders,
} from "../../core/tests/fixtures/webhookSigning.js";

const { createWebhookHandler, verifyWebhookRequest, WebhookVerificationError } =
  await import("../dist/webhook.js");

function post(body, headers) {
  return new Request("https://app.example.com/api/webhooks/seamless", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
}

describe("createWebhookHandler", () => {
  it("verifies the raw body and hands the typed event to onEvent", async () => {
    const received = [];
    const POST = createWebhookHandler({
      secret: WEBHOOK_SECRET,
      onEvent: (event) => {
        received.push(event);
      },
    });
    const res = await POST(post(WEBHOOK_BODY, signedHeaders(WEBHOOK_BODY)));
    expect(res.status).toBe(204);
    expect(received).toEqual([
      expect.objectContaining({
        id: "evt_01",
        type: "user.created",
        data: { userId: "user_01", email: "zoë@example.com", phone: null },
      }),
    ]);
  });

  it("answers with the Response onEvent returns", async () => {
    const POST = createWebhookHandler({
      secret: WEBHOOK_SECRET,
      onEvent: (event) => Response.json({ seen: event.id }, { status: 202 }),
    });
    const res = await POST(post(WEBHOOK_BODY, signedHeaders(WEBHOOK_BODY)));
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ seen: "evt_01" });
  });

  it("refuses a tampered body with the reason", async () => {
    const onEvent = () => {
      throw new Error("must not run");
    };
    const POST = createWebhookHandler({ secret: WEBHOOK_SECRET, onEvent });
    const res = await POST(
      post(WEBHOOK_BODY.replace("user_01", "user_02"), signedHeaders(WEBHOOK_BODY)),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "invalid_webhook",
      reason: "invalid_signature",
    });
  });

  it("refuses a delivery with no signature headers", async () => {
    const POST = createWebhookHandler({ secret: WEBHOOK_SECRET, onEvent: () => {} });
    const res = await POST(post(WEBHOOK_BODY, {}));
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe("missing_header");
  });

  it("accepts either secret while one rotates", async () => {
    const POST = createWebhookHandler({
      secret: [NEXT_WEBHOOK_SECRET, WEBHOOK_SECRET],
      onEvent: () => {},
    });
    for (const secret of [WEBHOOK_SECRET, NEXT_WEBHOOK_SECRET]) {
      const res = await POST(post(WEBHOOK_BODY, signedHeaders(WEBHOOK_BODY, [secret])));
      expect(res.status).toBe(204);
    }
  });
});

describe("verifyWebhookRequest", () => {
  it("returns the typed event", async () => {
    const event = await verifyWebhookRequest(post(WEBHOOK_BODY, signedHeaders(WEBHOOK_BODY)), {
      secret: WEBHOOK_SECRET,
    });
    expect(event.type).toBe("user.created");
  });

  it("verifies the bytes as sent, which request.text() would alter", async () => {
    // text() drops a leading byte order mark, so only the raw bytes carry the
    // signature through. The signed body then fails to parse, after verifying.
    const body = `﻿${WEBHOOK_BODY}`;
    const err = await verifyWebhookRequest(post(body, signedHeaders(body)), {
      secret: WEBHOOK_SECRET,
    }).catch((e) => e);
    expect(err).toBeInstanceOf(WebhookVerificationError);
    expect(err.reason).toBe("invalid_payload");
  });
});
