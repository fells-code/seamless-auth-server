import { jest } from "@jest/globals";
import Fastify from "fastify";

const { default: seamlessAuth } = await import("../dist/index.js");

const OPTIONS = {
  prefix: "/auth",
  fetchManifest: false,
  authServerUrl: "https://auth.example.com",
  cookieSecret: "cookie-secret-cookie-secret-cookie-secret",
  serviceSecret: "service-secret-service-secret-service-secret",
  audience: "https://auth.example.com",
  jwksKid: "test-main",
};

let warn;

beforeEach(() => {
  warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
  global.fetch = jest.fn(async () => Response.json({ error: "nope" }, { status: 400 }));
});

afterEach(() => {
  warn.mockRestore();
});

// The x-seamless-client-ip the adapter sends upstream for one login request.
async function forwardedIp(fastifyOptions, { peer, forwardedFor }) {
  const app = Fastify(fastifyOptions);
  await app.register(seamlessAuth, OPTIONS);
  await app.ready();

  try {
    await app.inject({
      method: "POST",
      url: "/auth/login",
      remoteAddress: peer,
      headers: forwardedFor ? { "x-forwarded-for": forwardedFor } : {},
      payload: { identifier: "a@b.test" },
    });
    return global.fetch.mock.calls[0][1].headers["x-seamless-client-ip"];
  } finally {
    await app.close();
  }
}

function warnings() {
  return warn.mock.calls.map(([message]) => String(message));
}

// Fastify does not expose trustProxy, so the adapter asks request.ip instead.
describe("client IP forwarding behind a proxy (#208)", () => {
  it("drops a client-chosen address when trustProxy trusts everything, and warns", async () => {
    const ip = await forwardedIp(
      { trustProxy: true },
      { peer: "10.0.0.5", forwardedFor: "6.6.6.6" },
    );

    expect(ip).toBeUndefined();
    expect(warnings()).toEqual([expect.stringMatching(/trusts every address/)]);
  });

  it("treats a trust function that accepts every address like trusting everything", async () => {
    expect(
      await forwardedIp(
        { trustProxy: () => true },
        { peer: "10.0.0.5", forwardedFor: "6.6.6.6" },
      ),
    ).toBeUndefined();
  });

  it("forwards the client behind a trusted proxy subnet, not a spoofed entry", async () => {
    expect(
      await forwardedIp(
        { trustProxy: "10.0.0.0/8" },
        { peer: "10.0.0.5", forwardedFor: "6.6.6.6, 203.0.113.50" },
      ),
    ).toBe("203.0.113.50");
  });

  it("forwards the client when trust is a one-hop function", async () => {
    expect(
      await forwardedIp(
        { trustProxy: (_address, hop) => hop < 1 },
        { peer: "10.0.0.5", forwardedFor: "6.6.6.6, 203.0.113.51" },
      ),
    ).toBe("203.0.113.51");
  });

  it("forwards the peer and warns when a proxy's X-Forwarded-For is trusted by nothing", async () => {
    const ip = await forwardedIp({}, { peer: "10.0.0.5", forwardedFor: "203.0.113.52" });

    expect(ip).toBe("10.0.0.5");
    expect(warnings()).toEqual([expect.stringMatching(/trusts no proxy/)]);
  });

  it("forwards the peer without a warning when there is no proxy", async () => {
    const ip = await forwardedIp({}, { peer: "203.0.113.53" });

    expect(ip).toBe("203.0.113.53");
    expect(warnings()).toEqual([]);
  });
});
