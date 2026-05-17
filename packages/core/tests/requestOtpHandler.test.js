import { jest } from "@jest/globals";

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("requestOtpHandler", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(jsonResponse(200, { message: "sent" }));
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("uses registration OTP endpoints by default", async () => {
    const { requestOtpHandler } = await import(
      "../dist/handlers/requestOtpHandler.js"
    );

    await requestOtpHandler(
      { kind: "email", authorization: "Bearer service-token" },
      { authServerUrl: "https://auth.example.com" },
    );

    expect(global.fetch).toHaveBeenCalledWith(
      "https://auth.example.com/otp/generate-email-otp",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("uses login OTP endpoints when requested", async () => {
    const { requestOtpHandler } = await import(
      "../dist/handlers/requestOtpHandler.js"
    );

    await requestOtpHandler(
      {
        kind: "phone",
        flow: "login",
        authorization: "Bearer service-token",
      },
      { authServerUrl: "https://auth.example.com" },
    );

    expect(global.fetch).toHaveBeenCalledWith(
      "https://auth.example.com/otp/generate-login-phone-otp",
      expect.objectContaining({ method: "GET" }),
    );
  });
});
