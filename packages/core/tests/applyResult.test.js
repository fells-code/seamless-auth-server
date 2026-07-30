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
        secure: true,
        sameSite: "none",
        path: "/",
      },
    ]);
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
