// Drives the response contract with a recording adapter and no framework, which
// is what a new adapter has to satisfy.
import jwt from "jsonwebtoken";

const { applyCookies, applyResult, resolveCookieSameSite, signSessionCookie } =
  await import("../dist/applyResult.js");

const SECRET = "cookie-secret-cookie-secret-cookie-secret";

function recorder() {
  const calls = { set: [], cleared: [], sent: [] };

  return {
    calls,
    setCookie: (c) => calls.set.push(c),
    clearCookie: (c) => calls.cleared.push(c),
    send: (status, body) => calls.sent.push({ status, body }),
  };
}

describe("resolveCookieSameSite", () => {
  it("defaults to none when secure and lax when not", () => {
    expect(resolveCookieSameSite({})).toBe("none");
    expect(resolveCookieSameSite({ cookieSecure: false })).toBe("lax");
  });

  it("honours an explicit policy either way", () => {
    expect(resolveCookieSameSite({ cookieSameSite: "strict" })).toBe("strict");
    expect(
      resolveCookieSameSite({ cookieSecure: false, cookieSameSite: "none" }),
    ).toBe("none");
  });
});

describe("applyResult failures", () => {
  it("sends an upstream body untouched", () => {
    const adapter = recorder();
    const upstream = {
      error: "oauth_profile_error",
      code: "oauth_missing_email",
    };

    applyResult({ status: 400, errorBody: upstream }, adapter, {
      cookieSecret: SECRET,
    });

    expect(adapter.calls.sent).toEqual([{ status: 400, body: upstream }]);
  });

  it("renders a code as { error }", () => {
    const adapter = recorder();

    applyResult({ status: 403, errorCode: "forbidden" }, adapter, {
      cookieSecret: SECRET,
    });

    expect(adapter.calls.sent[0].body).toEqual({ error: "forbidden" });
  });

  it("includes details alongside a code when present", () => {
    const adapter = recorder();
    const details = { name: "ZodError", message: "bad" };

    applyResult({ status: 400, errorCode: "bad", details }, adapter, {
      cookieSecret: SECRET,
    });

    expect(adapter.calls.sent[0].body).toEqual({ error: "bad", details });
  });

  it("prefers an upstream body over a code", () => {
    const adapter = recorder();

    applyResult(
      { status: 400, errorBody: { error: "upstream" }, errorCode: "code" },
      adapter,
      { cookieSecret: SECRET },
    );

    expect(adapter.calls.sent[0].body).toEqual({ error: "upstream" });
  });
});

describe("applyResult success", () => {
  it("sends the body", () => {
    const adapter = recorder();

    applyResult({ status: 200, body: { user: 1 } }, adapter, {
      cookieSecret: SECRET,
    });

    expect(adapter.calls.sent).toEqual([{ status: 200, body: { user: 1 } }]);
  });

  it("signals no body when there is none, rather than sending null", () => {
    const adapter = recorder();

    applyResult({ status: 204 }, adapter, { cookieSecret: SECRET });

    expect(adapter.calls.sent).toEqual([{ status: 204, body: undefined }]);
  });
});

describe("cookies", () => {
  const cookieResult = {
    status: 200,
    setCookies: [
      {
        name: "seamless-access",
        value: { sub: "u1", token: "t" },
        ttl: 300,
        domain: "acme.test",
      },
    ],
    clearCookies: ["seamless-ephemeral"],
  };

  it("signs the payload into a readable session cookie", () => {
    const adapter = recorder();

    applyResult(cookieResult, adapter, { cookieSecret: SECRET });

    const [cookie] = adapter.calls.set;
    expect(cookie.name).toBe("seamless-access");
    expect(jwt.verify(cookie.value, SECRET)).toMatchObject({
      sub: "u1",
      token: "t",
    });
    expect(cookie.maxAgeSeconds).toBe(300);
    expect(cookie.domain).toBe("acme.test");
    expect(cookie).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "none",
      path: "/",
    });
  });

  it("mirrors the set attributes when clearing, so the browser accepts it", () => {
    const adapter = recorder();

    applyResult(cookieResult, adapter, {
      cookieSecret: SECRET,
      cookieDomain: "acme.test",
    });

    expect(adapter.calls.cleared).toEqual([
      {
        name: "seamless-ephemeral",
        domain: "acme.test",
        expires: new Date(0),
        secure: true,
        sameSite: "none",
        path: "/",
      },
    ]);
  });

  // Both lifetimes are specified so every adapter emits the same header. Left to
  // the adapter, one framework sends Max-Age only and another sends both, and
  // the two issue different cookies for the same session.
  it("gives a set cookie both a max age and a matching absolute expiry", () => {
    const adapter = recorder();
    const before = Date.now();

    applyResult(cookieResult, adapter, { cookieSecret: SECRET });

    const { maxAgeSeconds, expires } = adapter.calls.set[0];
    expect(maxAgeSeconds).toBe(300);
    expect(expires).toBeInstanceOf(Date);
    expect(expires.getTime()).toBeGreaterThanOrEqual(before + 300 * 1000);
    expect(expires.getTime()).toBeLessThanOrEqual(Date.now() + 300 * 1000);
  });

  it("clears with the epoch", () => {
    const adapter = recorder();

    applyResult(cookieResult, adapter, { cookieSecret: SECRET });

    expect(adapter.calls.cleared[0].expires.getTime()).toBe(0);
  });

  it("clears before setting, since doing both replaces a session", () => {
    const order = [];
    const adapter = {
      setCookie: () => order.push("set"),
      clearCookie: () => order.push("clear"),
      send: () => {},
    };

    applyResult(cookieResult, adapter, { cookieSecret: SECRET });

    expect(order).toEqual(["clear", "set"]);
  });

  it("writes cookies before the body", () => {
    const order = [];
    const adapter = {
      setCookie: () => order.push("cookie"),
      clearCookie: () => order.push("cookie"),
      send: () => order.push("send"),
    };

    applyResult(cookieResult, adapter, { cookieSecret: SECRET });

    expect(order.indexOf("send")).toBe(order.length - 1);
  });

  it("follows the insecure dev policy", () => {
    const adapter = recorder();

    applyResult(cookieResult, adapter, {
      cookieSecret: SECRET,
      cookieSecure: false,
    });

    expect(adapter.calls.set[0]).toMatchObject({
      secure: false,
      sameSite: "lax",
    });
    expect(adapter.calls.cleared[0]).toMatchObject({
      secure: false,
      sameSite: "lax",
    });
  });

  it("refuses to sign without a secret", () => {
    expect(() =>
      applyResult(cookieResult, recorder(), { cookieSecret: "" }),
    ).toThrow("Missing cookieSecret");
  });

  it("does not need a secret when there is nothing to sign", () => {
    const adapter = recorder();

    expect(() =>
      applyResult({ status: 200, clearCookies: ["a"] }, adapter, {
        cookieSecret: "",
      }),
    ).not.toThrow();
    expect(adapter.calls.cleared).toHaveLength(1);
  });
});

describe("applyCookies", () => {
  it("applies cookies without sending anything, for middleware", () => {
    const adapter = recorder();

    applyCookies(
      {
        setCookies: [{ name: "a", value: { sub: "u" }, ttl: 60 }],
        clearCookies: ["b"],
      },
      adapter,
      { cookieSecret: SECRET },
    );

    expect(adapter.calls.set).toHaveLength(1);
    expect(adapter.calls.cleared).toHaveLength(1);
    expect(adapter.calls.sent).toHaveLength(0);
  });
});

describe("signSessionCookie", () => {
  it("produces a token that expires with the ttl", () => {
    const decoded = jwt.verify(
      signSessionCookie({ sub: "u1" }, SECRET, 300),
      SECRET,
    );

    expect(decoded.exp - decoded.iat).toBe(300);
  });
});

// The auth API's registration response has sent `ttl` as the string "300".
// Handler results declare it a number, but they fill it from a parsed JSON body,
// so nothing caught it. Express hid it by multiplying into milliseconds, which
// coerces; Fastify passed it to `cookie`, whose Number.isInteger check threw and
// failed the request. Normalizing here is what stops the two disagreeing.
describe("cookie ttl arriving from an untyped upstream body", () => {
  const setCookie = (ttl) => {
    const adapter = recorder();

    applyCookies(
      { setCookies: [{ name: "seamless-ephemeral", value: { sub: "u1" }, ttl }] },
      adapter,
      { cookieSecret: SECRET },
    );

    return adapter.calls.set[0];
  };

  it("treats a numeric string exactly like the number", () => {
    const fromString = setCookie("300");
    const fromNumber = setCookie(300);

    expect(fromString.maxAgeSeconds).toBe(300);
    expect(fromString.maxAgeSeconds).toBe(fromNumber.maxAgeSeconds);
  });

  it("emits a maxAge the cookie library will accept", () => {
    expect(Number.isInteger(setCookie("300").maxAgeSeconds)).toBe(true);
  });

  it("dates the expiry from the parsed seconds", () => {
    const before = Date.now();
    const { expires } = setCookie("300");

    expect(expires.getTime()).toBeGreaterThanOrEqual(before + 300 * 1000);
    expect(expires.getTime()).toBeLessThan(before + 301 * 1000);
  });

  it("signs the cookie for the same lifetime either way", () => {
    const decoded = jwt.verify(setCookie("300").value, SECRET);

    expect(decoded.exp - decoded.iat).toBe(300);
  });

  it.each([
    ["a non-numeric string", "15m"],
    ["an empty string", ""],
    ["a fraction", 300.5],
    ["zero", 0],
    ["a negative", -300],
    ["null", null],
    ["undefined", undefined],
  ])("refuses %s rather than issuing a cookie nobody can vouch for", (_l, ttl) => {
    expect(() => setCookie(ttl)).toThrow(/unusable cookie ttl/);
  });
});
