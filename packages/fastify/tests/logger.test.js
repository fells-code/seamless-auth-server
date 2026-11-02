import { jest } from "@jest/globals";
import Fastify from "fastify";

const { default: seamlessAuth, setSeamlessLogger } = await import(
  "../dist/index.js"
);

describe("setSeamlessLogger (fastify)", () => {
  afterEach(() => {
    setSeamlessLogger();
    jest.restoreAllMocks();
  });

  it("receives the adapter's own warnings instead of console", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const logger = { warn: jest.fn(), error: jest.fn() };
    setSeamlessLogger(logger);

    const app = Fastify();
    await app.register(seamlessAuth, {
      prefix: "/auth",
      fetchManifest: false,
      authServerUrl: "https://auth.example.com",
      cookieSecret: "cookie-secret-cookie-secret-cookie-secret",
      serviceSecret: "service-secret-service-secret-service-secret",
      audience: "https://auth.example.com",
    });
    await app.ready();
    await app.close();

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringMatching(/^\[SEAMLESS-AUTH-FASTIFY\] - jwksKid is not set/),
    );
    expect(warn).not.toHaveBeenCalled();
  });
});
