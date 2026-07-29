// Exercises message delivery through core alone, with no adapter involved. The
// express suite covers the same code through HTTP routes; this covers it the way
// a new adapter would call it.
import { jest } from "@jest/globals";

const { applyExternalDelivery, deliverAuthMessage, stripDelivery } =
  await import("../dist/deliverAuthMessage.js");

function emailTransport() {
  return {
    name: "test-email",
    send: jest.fn(async () => ({
      accepted: true,
      provider: "test-email",
      channel: "email",
    })),
  };
}

function smsTransport() {
  return {
    name: "test-sms",
    send: jest.fn(async () => ({
      accepted: true,
      provider: "test-sms",
      channel: "sms",
    })),
  };
}

describe("deliverAuthMessage", () => {
  it("builds an OTP email from the configured defaults", async () => {
    const email = emailTransport();

    await deliverAuthMessage(
      { email, defaults: { appName: "Acme", emailFrom: "no-reply@acme.test" } },
      { kind: "otp_email", to: "user@acme.test", token: "123456" },
    );

    const [message] = email.send.mock.calls[0];
    expect(message.to).toBe("user@acme.test");
    expect(message.from).toBe("no-reply@acme.test");
    expect(message.subject).toBe("Acme - Verify your email");
    expect(message.text).toContain("123456");
  });

  it("prefers a handler over the transport", async () => {
    const email = emailTransport();
    const sendOtpEmail = jest.fn(async () => ({
      accepted: true,
      provider: "handler",
      channel: "email",
    }));

    await deliverAuthMessage(
      { email, handlers: { sendOtpEmail } },
      { kind: "otp_email", to: "user@acme.test", token: "123456" },
    );

    expect(sendOtpEmail).toHaveBeenCalledTimes(1);
    expect(email.send).not.toHaveBeenCalled();
  });

  it("lets an override reshape the built message", async () => {
    const email = emailTransport();

    await deliverAuthMessage(
      {
        email,
        overrides: {
          otpEmail: (input, defaults) => ({
            ...defaults,
            subject: `Code for ${input.to}`,
          }),
        },
      },
      { kind: "otp_email", to: "user@acme.test", token: "123456" },
    );

    expect(email.send.mock.calls[0][0].subject).toBe("Code for user@acme.test");
  });

  it("routes an SMS instruction to the SMS transport", async () => {
    const sms = smsTransport();

    await deliverAuthMessage(
      { sms, defaults: { appName: "Acme" } },
      { kind: "otp_sms", to: "+15555550100", token: 123456 },
    );

    expect(sms.send.mock.calls[0][0].body).toContain("123456");
  });

  it("puts the link in a magic-link email", async () => {
    const email = emailTransport();

    await deliverAuthMessage(
      { email },
      {
        kind: "magic_link_email",
        to: "user@acme.test",
        magicLinkUrl: "https://acme.test/verify/abc",
      },
    );

    expect(email.send.mock.calls[0][0].text).toContain(
      "https://acme.test/verify/abc",
    );
  });

  it("throws when the instruction has no transport to deliver it", async () => {
    await expect(
      deliverAuthMessage(
        {},
        { kind: "otp_email", to: "user@acme.test", token: "1" },
      ),
    ).rejects.toThrow("Missing email transport for OTP email delivery.");
  });

  it("does nothing without messaging or without an instruction", async () => {
    const email = emailTransport();

    await deliverAuthMessage(undefined, {
      kind: "otp_email",
      to: "user@acme.test",
      token: "1",
    });
    await deliverAuthMessage({ email }, undefined);

    expect(email.send).not.toHaveBeenCalled();
  });
});

describe("applyExternalDelivery", () => {
  it("delivers the payload and strips it from the body", async () => {
    const email = emailTransport();

    const body = await applyExternalDelivery(
      { email },
      {
        message: "sent",
        delivery: { kind: "otp_email", to: "user@acme.test", token: "123456" },
      },
    );

    expect(email.send).toHaveBeenCalledTimes(1);
    expect(body).toEqual({ message: "sent" });
    expect(body).not.toHaveProperty("delivery");
  });

  it("warns when messaging is configured but the API sent no payload", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});

    const body = await applyExternalDelivery(
      { email: emailTransport() },
      { message: "sent" },
    );

    expect(body).toEqual({ message: "sent" });
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("no delivery payload"),
    );
    warn.mockRestore();
  });

  it("stays quiet when messaging is not configured", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});

    await applyExternalDelivery(undefined, { message: "sent" });

    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("stripDelivery", () => {
  it("removes only the delivery key", () => {
    expect(stripDelivery({ a: 1, delivery: { kind: "otp_sms" } })).toEqual({
      a: 1,
    });
  });
});
