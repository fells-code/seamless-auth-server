import { createHmac } from "node:crypto";
import { jest } from "@jest/globals";

import {
  verifyWebhook,
  WebhookVerificationError,
  WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS,
} from "../dist/webhook.js";

// Known-answer vectors, computed outside Node (Python hmac) and pinned here.
const SECRET_A = "whsec_AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA=";
const SECRET_B = "whsec_ZWZnaGlqa2xtbm9wcXJzdHV2d3h5ent8fX5/gIGCg4Q=";
const ID = "evt_01";
const TIMESTAMP = 1767225600;
const BODY =
  '{"id":"evt_01","type":"user.created","version":1,"timestamp":"2026-01-01T00:00:00.000Z","data":{"userId":"user_01","email":"ada@example.com","phone":null}}';
const SIGNATURE_A = "v1,2Wdjh1HKOsFxwMrIhCkeI9af2ld08BNRpv8fuepQbhg=";
const SIGNATURE_B = "v1,s6HpmlDOYZalhTpS1nV7JQMhqmAhCh46dQzUOnTdoZE=";

function headers(overrides = {}) {
  return {
    "webhook-id": ID,
    "webhook-timestamp": String(TIMESTAMP),
    "webhook-signature": SIGNATURE_A,
    ...overrides,
  };
}

function sign(secret, id, timestamp, body) {
  const key = Buffer.from(secret.slice("whsec_".length), "base64");
  const digest = createHmac("sha256", key)
    .update(`${id}.${timestamp}.${body}`)
    .digest("base64");
  return `v1,${digest}`;
}

function reasonOf(fn) {
  try {
    fn();
  } catch (err) {
    if (err instanceof WebhookVerificationError) return err.reason;
    throw err;
  }
  return "verified";
}

const at = (seconds) =>
  jest.spyOn(Date, "now").mockReturnValue(seconds * 1000);

beforeEach(() => at(TIMESTAMP));
afterEach(() => jest.restoreAllMocks());

describe("verifyWebhook", () => {
  it("verifies the Standard Webhooks specification vector", () => {
    // The spec's own example; its body is not a Seamless event, so verification
    // gets past the signature and stops at the payload.
    at(1614265330);
    const verify = (secret) =>
      verifyWebhook(
        '{"test": 2432232314}',
        {
          "webhook-id": "msg_p5jXN8AQM9LWM0D4loKWxJek",
          "webhook-timestamp": "1614265330",
          "webhook-signature": "v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=",
        },
        { secret },
      );
    expect(reasonOf(() => verify("whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw"))).toBe(
      "invalid_payload",
    );
    expect(reasonOf(() => verify(SECRET_B))).toBe("invalid_signature");
  });

  it("returns the typed event for a known-answer vector", () => {
    const event = verifyWebhook(BODY, headers(), { secret: SECRET_A });
    expect(event).toEqual({
      id: "evt_01",
      type: "user.created",
      version: 1,
      timestamp: "2026-01-01T00:00:00.000Z",
      data: { userId: "user_01", email: "ada@example.com", phone: null },
    });
  });

  it("verifies the raw bytes as well as a string", () => {
    const event = verifyWebhook(Buffer.from(BODY), headers(), {
      secret: SECRET_A,
    });
    expect(event.id).toBe("evt_01");
    expect(
      verifyWebhook(new Uint8Array(Buffer.from(BODY)), headers(), {
        secret: SECRET_A,
      }).id,
    ).toBe("evt_01");
  });

  it("refuses re-serialized JSON", () => {
    const spaced = BODY.replace('"type":', '"type": ');
    const signature = sign(SECRET_A, ID, TIMESTAMP, spaced);
    expect(
      reasonOf(() =>
        verifyWebhook(spaced, headers({ "webhook-signature": signature }), {
          secret: SECRET_A,
        }),
      ),
    ).toBe("verified");
    expect(
      reasonOf(() =>
        verifyWebhook(
          JSON.stringify(JSON.parse(spaced)),
          headers({ "webhook-signature": signature }),
          { secret: SECRET_A },
        ),
      ),
    ).toBe("invalid_signature");
  });

  it("refuses a parsed body outright", () => {
    expect(() =>
      verifyWebhook(JSON.parse(BODY), headers(), { secret: SECRET_A }),
    ).toThrow(TypeError);
  });

  it.each([
    ["body", () => [BODY.replace("ada@", "eve@"), headers()]],
    ["id", () => [BODY, headers({ "webhook-id": "evt_02" })]],
    [
      "timestamp",
      () => [BODY, headers({ "webhook-timestamp": String(TIMESTAMP + 1) })],
    ],
  ])("refuses a tampered %s", (_, input) => {
    const [body, hdrs] = input();
    expect(reasonOf(() => verifyWebhook(body, hdrs, { secret: SECRET_A }))).toBe(
      "invalid_signature",
    );
  });

  it("refuses the wrong secret", () => {
    expect(reasonOf(() => verifyWebhook(BODY, headers(), { secret: SECRET_B }))).toBe(
      "invalid_signature",
    );
  });

  it("refuses an equal-length wrong signature", () => {
    const bytes = Buffer.from(SIGNATURE_A.slice(3), "base64");
    bytes[31] ^= 0x01;
    const forged = `v1,${bytes.toString("base64")}`;
    expect(forged.length).toBe(SIGNATURE_A.length);
    expect(
      reasonOf(() =>
        verifyWebhook(BODY, headers({ "webhook-signature": forged }), {
          secret: SECRET_A,
        }),
      ),
    ).toBe("invalid_signature");
  });

  it("refuses a truncated signature without throwing anything else", () => {
    const truncated = `v1,${Buffer.from(SIGNATURE_A.slice(3), "base64")
      .subarray(0, 16)
      .toString("base64")}`;
    expect(
      reasonOf(() =>
        verifyWebhook(BODY, headers({ "webhook-signature": truncated }), {
          secret: SECRET_A,
        }),
      ),
    ).toBe("invalid_signature");
  });

  describe("timestamp tolerance", () => {
    const tolerance = WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS;

    it("is 300 seconds", () => {
      expect(tolerance).toBe(300);
    });

    it.each([
      ["old", TIMESTAMP + tolerance + 1],
      ["future", TIMESTAMP - tolerance - 1],
    ])("refuses an %s timestamp", (_, now) => {
      at(now);
      expect(reasonOf(() => verifyWebhook(BODY, headers(), { secret: SECRET_A }))).toBe(
        "timestamp_out_of_tolerance",
      );
    });

    it.each([TIMESTAMP + tolerance, TIMESTAMP - tolerance])(
      "accepts the edge of the window (clock at %i)",
      (now) => {
        at(now);
        expect(reasonOf(() => verifyWebhook(BODY, headers(), { secret: SECRET_A }))).toBe(
          "verified",
        );
      },
    );

    it("checks the window before the signature", () => {
      at(TIMESTAMP + tolerance + 1);
      expect(
        reasonOf(() =>
          verifyWebhook(BODY, headers({ "webhook-signature": SIGNATURE_B }), {
            secret: SECRET_A,
          }),
        ),
      ).toBe("timestamp_out_of_tolerance");
    });
  });

  describe("secret rotation", () => {
    const both = { secret: [SECRET_A, SECRET_B] };

    it.each([
      ["the first secret", SIGNATURE_A],
      ["the second secret", SIGNATURE_B],
      ["both secrets", `${SIGNATURE_A} ${SIGNATURE_B}`],
    ])("accepts a delivery signed with %s", (_, signature) => {
      expect(
        verifyWebhook(BODY, headers({ "webhook-signature": signature }), both).id,
      ).toBe("evt_01");
    });

    it("accepts the new signature beside one from a secret it no longer holds", () => {
      expect(
        verifyWebhook(
          BODY,
          headers({ "webhook-signature": `${SIGNATURE_A} ${SIGNATURE_B}` }),
          { secret: SECRET_B },
        ).id,
      ).toBe("evt_01");
    });

    it("refuses a signature from neither secret", () => {
      const other = "whsec_" + Buffer.alloc(32, 7).toString("base64");
      expect(
        reasonOf(() =>
          verifyWebhook(
            BODY,
            headers({ "webhook-signature": sign(other, ID, TIMESTAMP, BODY) }),
            both,
          ),
        ),
      ).toBe("invalid_signature");
    });

    it.each([
      ["no secrets", []],
      ["three secrets", [SECRET_A, SECRET_B, SECRET_A]],
      ["a secret without the whsec_ prefix", SECRET_A.slice(6)],
      ["a secret with another prefix", `Whsec_${SECRET_A.slice(6)}`],
      ["a secret that is not base64", "whsec_not base64!"],
      ["an empty secret", "whsec_"],
    ])("refuses %s as configuration", (_, secret) => {
      expect(() => verifyWebhook(BODY, headers(), { secret })).toThrow(TypeError);
    });
  });

  describe("signature versions", () => {
    it("ignores unknown versions beside a valid v1 signature", () => {
      const signature = `v2,${Buffer.alloc(32).toString("base64")} ${SIGNATURE_A} v1a,abcd`;
      expect(
        verifyWebhook(BODY, headers({ "webhook-signature": signature }), {
          secret: SECRET_A,
        }).id,
      ).toBe("evt_01");
    });

    it("refuses a header with no v1 signature", () => {
      expect(
        reasonOf(() =>
          verifyWebhook(
            BODY,
            headers({ "webhook-signature": `v2,${SIGNATURE_A.slice(3)}` }),
            { secret: SECRET_A },
          ),
        ),
      ).toBe("unsupported_version");
    });
  });

  describe("headers", () => {
    it.each(["webhook-id", "webhook-timestamp", "webhook-signature"])(
      "refuses a missing %s",
      (name) => {
        const hdrs = headers();
        delete hdrs[name];
        expect(reasonOf(() => verifyWebhook(BODY, hdrs, { secret: SECRET_A }))).toBe(
          "missing_header",
        );
      },
    );

    it.each([
      ["an empty id", { "webhook-id": "" }],
      ["a repeated id", { "webhook-id": [ID, ID] }],
      ["a fractional timestamp", { "webhook-timestamp": `${TIMESTAMP}.0` }],
      ["a negative timestamp", { "webhook-timestamp": `-${TIMESTAMP}` }],
      ["a non-numeric timestamp", { "webhook-timestamp": "soon" }],
      ["a signature without a version", { "webhook-signature": SIGNATURE_A.slice(3) }],
      ["a signature without a value", { "webhook-signature": `v1, ${SIGNATURE_A}` }],
      ["a signature entry with no version", { "webhook-signature": `,abc ${SIGNATURE_A}` }],
    ])("refuses %s", (_, overrides) => {
      expect(
        reasonOf(() => verifyWebhook(BODY, headers(overrides), { secret: SECRET_A })),
      ).toBe("malformed_header");
    });

    it("refuses a timestamp in milliseconds", () => {
      expect(
        reasonOf(() =>
          verifyWebhook(BODY, headers({ "webhook-timestamp": `${TIMESTAMP}000` }), {
            secret: SECRET_A,
          }),
        ),
      ).toBe("timestamp_out_of_tolerance");
    });

    it("reads fetch Headers", () => {
      expect(
        verifyWebhook(BODY, new Headers(headers()), { secret: SECRET_A }).id,
      ).toBe("evt_01");
    });

    it("reads header names case-insensitively from a plain object", () => {
      expect(
        verifyWebhook(
          BODY,
          {
            "Webhook-Id": ID,
            "WEBHOOK-TIMESTAMP": String(TIMESTAMP),
            "Webhook-Signature": SIGNATURE_A,
          },
          { secret: SECRET_A },
        ).id,
      ).toBe("evt_01");
    });
  });

  describe("payload", () => {
    function signed(body) {
      return headers({ "webhook-signature": sign(SECRET_A, ID, TIMESTAMP, body) });
    }

    it("parses only after the signature verifies", () => {
      expect(
        reasonOf(() => verifyWebhook("not json", headers(), { secret: SECRET_A })),
      ).toBe("invalid_signature");
    });

    it("refuses a signed body that is not JSON", () => {
      expect(
        reasonOf(() =>
          verifyWebhook("not json", signed("not json"), { secret: SECRET_A }),
        ),
      ).toBe("invalid_payload");
    });

    it("refuses a signed event of an unknown type", () => {
      const body = BODY.replace("user.created", "user.teleported");
      expect(
        reasonOf(() => verifyWebhook(body, signed(body), { secret: SECRET_A })),
      ).toBe("invalid_payload");
    });

    it("types the test event", () => {
      const body = JSON.stringify({
        id: "evt_test",
        type: "webhook.test",
        version: 1,
        timestamp: "2026-01-01T00:00:00.000Z",
        data: { endpointId: "ep_1" },
      });
      expect(verifyWebhook(body, signed(body), { secret: SECRET_A }).type).toBe(
        "webhook.test",
      );
    });
  });

  it("gives the reason and a name on the error", () => {
    try {
      verifyWebhook(BODY, headers(), { secret: SECRET_B });
    } catch (err) {
      expect(err).toBeInstanceOf(WebhookVerificationError);
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe("WebhookVerificationError");
      expect(err.reason).toBe("invalid_signature");
      return;
    }
    throw new Error("expected a WebhookVerificationError");
  });
});
