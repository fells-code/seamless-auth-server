import { jest } from "@jest/globals";

const { getSeamlessLogger, setSeamlessLogger } = await import(
  "../dist/logger.js"
);
const { applyExternalDelivery } = await import("../dist/deliverAuthMessage.js");

function recorder() {
  const warned = [];
  const errored = [];
  return {
    warned,
    errored,
    warn: (m) => warned.push(m),
    error: (m) => errored.push(m),
  };
}

afterEach(() => setSeamlessLogger());

describe("setSeamlessLogger", () => {
  it("defaults to console", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});

    getSeamlessLogger().warn("hello");

    expect(warn).toHaveBeenCalledWith("hello");
    warn.mockRestore();
  });

  it("routes diagnostics to an injected logger", () => {
    const logger = recorder();
    setSeamlessLogger(logger);

    getSeamlessLogger().warn("a");
    getSeamlessLogger().error("b");

    expect(logger.warned).toEqual(["a"]);
    expect(logger.errored).toEqual(["b"]);
  });

  it("goes back to console when passed nothing", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    setSeamlessLogger(recorder());
    setSeamlessLogger();

    getSeamlessLogger().warn("back");

    expect(warn).toHaveBeenCalledWith("back");
    warn.mockRestore();
  });

  // Read per call, so injecting a logger after a module captured the reference
  // still takes effect.
  it("applies to a later swap", () => {
    const first = recorder();
    const second = recorder();

    setSeamlessLogger(first);
    getSeamlessLogger().warn("one");
    setSeamlessLogger(second);
    getSeamlessLogger().warn("two");

    expect(first.warned).toEqual(["one"]);
    expect(second.warned).toEqual(["two"]);
  });
});

describe("core diagnostics go through it", () => {
  it("routes the missing delivery payload warning", async () => {
    const logger = recorder();
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    setSeamlessLogger(logger);

    await applyExternalDelivery(
      { email: { name: "e", send: async () => ({}) } },
      {
        message: "sent",
      },
    );

    expect(logger.warned).toHaveLength(1);
    expect(logger.warned[0]).toContain("no delivery payload");
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
