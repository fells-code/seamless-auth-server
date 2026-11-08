import express from "express";
import request from "supertest";

import {
  NEXT_WEBHOOK_SECRET,
  WEBHOOK_BODY,
  WEBHOOK_SECRET,
  signedHeaders,
} from "../../core/tests/fixtures/webhookSigning.js";

const { requireWebhook, verifyWebhook, WebhookVerificationError } = await import(
  "../dist/webhook.js"
);

function app(options = { secret: WEBHOOK_SECRET }) {
  const received = [];
  const server = express();
  server.post("/webhooks/seamless", requireWebhook(options), (req, res) => {
    received.push(req.webhook);
    res.sendStatus(204);
  });
  server.use(express.json());
  server.post("/json", (req, res) => res.json(req.body));
  return { server, received };
}

function deliver(server, body, headers, contentType = "application/json") {
  let call = request(server).post("/webhooks/seamless");
  if (contentType) call = call.set("content-type", contentType);
  for (const [name, value] of Object.entries(headers)) call = call.set(name, value);
  return call.send(body);
}

describe("requireWebhook", () => {
  it("verifies the raw body and puts the typed event on req.webhook", async () => {
    const { server, received } = app();
    const res = await deliver(server, WEBHOOK_BODY, signedHeaders(WEBHOOK_BODY));
    expect(res.status).toBe(204);
    expect(received).toEqual([
      expect.objectContaining({
        id: "evt_01",
        type: "user.created",
        data: { userId: "user_01", email: "zoë@example.com", phone: null },
      }),
    ]);
  });

  it("reads the body raw whatever the content type", async () => {
    const { server } = app();
    const res = await deliver(server, WEBHOOK_BODY, signedHeaders(WEBHOOK_BODY), "text/plain");
    expect(res.status).toBe(204);
  });

  it("refuses a tampered body with the reason", async () => {
    const { server, received } = app();
    const res = await deliver(
      server,
      WEBHOOK_BODY.replace("user_01", "user_02"),
      signedHeaders(WEBHOOK_BODY),
    );
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "invalid_webhook", reason: "invalid_signature" });
    expect(received).toEqual([]);
  });

  it("refuses a delivery with no signature headers", async () => {
    const { server } = app();
    const res = await deliver(server, WEBHOOK_BODY, {});
    expect(res.status).toBe(400);
    expect(res.body.reason).toBe("missing_header");
  });

  it("refuses an empty body", async () => {
    const { server } = app();
    const res = await deliver(server, undefined, signedHeaders(WEBHOOK_BODY), null);
    expect(res.status).toBe(400);
    expect(res.body.reason).toBe("invalid_signature");
  });

  it("accepts either secret while one rotates", async () => {
    const { server } = app({ secret: [NEXT_WEBHOOK_SECRET, WEBHOOK_SECRET] });
    for (const secret of [WEBHOOK_SECRET, NEXT_WEBHOOK_SECRET]) {
      const res = await deliver(server, WEBHOOK_BODY, signedHeaders(WEBHOOK_BODY, [secret]));
      expect(res.status).toBe(204);
    }
  });

  it("fails loudly when express.json() parsed the body first", async () => {
    const server = express();
    server.use(express.json());
    server.post("/webhooks/seamless", requireWebhook({ secret: WEBHOOK_SECRET }), (_req, res) =>
      res.sendStatus(204),
    );
    const errors = [];
    server.use((err, _req, res, _next) => {
      errors.push(err);
      res.sendStatus(500);
    });
    const res = await deliver(server, WEBHOOK_BODY, signedHeaders(WEBHOOK_BODY));
    expect(res.status).toBe(500);
    expect(errors[0]).toBeInstanceOf(TypeError);
  });

  it("leaves JSON parsing in place for the app's other routes", async () => {
    const { server } = app();
    const res = await request(server).post("/json").send({ hello: "world" });
    expect(res.body).toEqual({ hello: "world" });
  });

  it("re-exports the core verifier", () => {
    expect(typeof verifyWebhook).toBe("function");
    expect(new WebhookVerificationError("invalid_signature", "x").reason).toBe(
      "invalid_signature",
    );
  });
});
