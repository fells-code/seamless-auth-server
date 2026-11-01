import { jest } from "@jest/globals";

const { createSeamlessAuthHandler } = await import("../dist/index.js");

const OPTIONS = {
  fetchManifest: false,
  authServerUrl: "https://auth.example.com",
  cookieSecret: "cookie-secret-cookie-secret-cookie-secret",
  serviceSecret: "service-secret-service-secret-service-secret",
  audience: "https://auth.example.com",
  jwksKid: "test-main",
};

const noClientIpWarnings = (spy) =>
  spy.mock.calls.filter(([message]) => /no client IP is forwarded/.test(message));

describe("client IP startup warning", () => {
  it("is skipped when a source is configured", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    createSeamlessAuthHandler({ ...OPTIONS, trustedProxies: ["10.0.0.0/8"] });
    createSeamlessAuthHandler({ ...OPTIONS, resolveClientIp: () => undefined });
    expect(noClientIpWarnings(warn)).toHaveLength(0);
  });

  it("is logged once when neither resolveClientIp nor trustedProxies is set", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    createSeamlessAuthHandler(OPTIONS);
    createSeamlessAuthHandler(OPTIONS);
    expect(noClientIpWarnings(warn)).toHaveLength(1);
  });
});
