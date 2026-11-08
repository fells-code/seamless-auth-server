import Fastify from "fastify";

import {
  NEXT_WEBHOOK_SECRET,
  WEBHOOK_BODY,
  WEBHOOK_SECRET,
  signedHeaders,
} from "../../core/tests/fixtures/webhookSigning.js";

const { seamlessWebhook, verifyWebhook } = await import("../dist/webhook.js");

async function build(options = {}) {
  const received = [];
  const app = Fastify();
  await app.register(seamlessWebhook, {
    path: "/webhooks/seamless",
    secret: WEBHOOK_SECRET,
    onEvent: (event) => {
      received.push(event);
    },
    ...options,
  });
  app.post("/json", async (request) => request.body);
  await app.ready();
  return { app, received };
}

function deliver(app, payload, headers, contentType = "application/json") {
  return app.inject({
    method: "POST",
    url: "/webhooks/seamless",
    headers: { ...(contentType ? { "content-type": contentType } : {}), ...headers },
    payload,
  });
}

describe("seamlessWebhook", () => {
  it("verifies the raw body and hands the typed event to onEvent", async () => {
    const { app, received } = await build();
    const res = await deliver(app, WEBHOOK_BODY, signedHeaders(WEBHOOK_BODY));
    expect(res.statusCode).toBe(204);
    expect(received).toEqual([
      expect.objectContaining({
        id: "evt_01",
        type: "user.created",
        data: { userId: "user_01", email: "zoë@example.com", phone: null },
      }),
    ]);
  });

  it("reads the body raw whatever the content type", async () => {
    const { app } = await build();
    const res = await deliver(app, WEBHOOK_BODY, signedHeaders(WEBHOOK_BODY), "text/plain");
    expect(res.statusCode).toBe(204);
  });

  it("sends what onEvent returns", async () => {
    const { app } = await build({ onEvent: (event) => ({ seen: event.id }) });
    const res = await deliver(app, WEBHOOK_BODY, signedHeaders(WEBHOOK_BODY));
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ seen: "evt_01" });
  });

  it("lets onEvent answer on reply", async () => {
    const { app } = await build({
      onEvent: (_event, _request, reply) => reply.code(202).send({ queued: true }),
    });
    const res = await deliver(app, WEBHOOK_BODY, signedHeaders(WEBHOOK_BODY));
    expect(res.statusCode).toBe(202);
  });

  it("refuses a tampered body with the reason", async () => {
    const { app, received } = await build();
    const res = await deliver(
      app,
      WEBHOOK_BODY.replace("user_01", "user_02"),
      signedHeaders(WEBHOOK_BODY),
    );
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "invalid_webhook", reason: "invalid_signature" });
    expect(received).toEqual([]);
  });

  it("refuses a delivery with no signature headers", async () => {
    const { app } = await build();
    const res = await deliver(app, WEBHOOK_BODY, {});
    expect(res.statusCode).toBe(400);
    expect(res.json().reason).toBe("missing_header");
  });

  it("refuses an empty body", async () => {
    const { app } = await build();
    const res = await deliver(app, undefined, signedHeaders(WEBHOOK_BODY), null);
    expect(res.statusCode).toBe(400);
    expect(res.json().reason).toBe("invalid_signature");
  });

  it("accepts either secret while one rotates", async () => {
    const { app } = await build({ secret: [NEXT_WEBHOOK_SECRET, WEBHOOK_SECRET] });
    for (const secret of [WEBHOOK_SECRET, NEXT_WEBHOOK_SECRET]) {
      const res = await deliver(app, WEBHOOK_BODY, signedHeaders(WEBHOOK_BODY, [secret]));
      expect(res.statusCode).toBe(204);
    }
  });

  it("keeps the raw parser inside its own context", async () => {
    const { app } = await build();
    const res = await app.inject({ method: "POST", url: "/json", payload: { hello: "world" } });
    expect(res.json()).toEqual({ hello: "world" });
  });

  it("re-exports the core verifier", () => {
    expect(typeof verifyWebhook).toBe("function");
  });
});
