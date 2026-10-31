import { jest } from "@jest/globals";
import { createPrivateKey, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import { exportJWK, generateKeyPair, SignJWT } from "jose";

const { createResourceServer } = await import("../dist/resourceServer.js");

const vectors = JSON.parse(
  readFileSync(new URL("./fixtures/verify-only/vectors.json", import.meta.url)),
);

function vectorServer(extra = {}) {
  return createResourceServer({
    issuer: vectors.issuer,
    audience: vectors.audience,
    jwks: vectors.jwks,
    currentDate: () => new Date(vectors.now * 1000),
    ...extra,
  });
}

// The vectors name claims as they appear on the wire; the JS user is camelCase.
function asVectorUser(user) {
  return {
    sub: user.id,
    client_id: user.clientId,
    scopes: user.scopes,
    roles: user.roles,
    sid: user.sid ?? null,
    org_id: user.orgId ?? null,
    acr: user.acr ?? null,
    amr: user.amr,
    auth_time: user.authTime ?? null,
  };
}

function guardFor(server, guard) {
  if (!guard) return () => undefined;
  if (guard.kind === "scope")
    return (user) => server.authorizeScopes(user, guard.scopes);
  if (guard.kind === "role")
    return (user) => server.authorizeRoles(user, guard.roles);
  return server.stepUp({
    acrValues: guard.acr_values,
    amr: guard.amr,
    maxAge: guard.max_age,
  });
}

describe("shared verify-only vectors", () => {
  const server = vectorServer();

  it.each(vectors.verify.map((entry) => [entry.name, entry]))(
    "verify %s",
    async (_, entry) => {
      const user = await server.verify(vectors.tokens[entry.name]);

      if (entry.valid) {
        expect(user).not.toBeNull();
        expect(asVectorUser(user)).toEqual(entry.user);
        expect(user.token).toBe(vectors.tokens[entry.name]);
      } else {
        expect(user).toBeNull();
      }
    },
  );

  it.each(vectors.requests.map((entry) => [entry.name, entry]))(
    "request %s",
    async (_, entry) => {
      const check = guardFor(server, entry.guard);
      const { user, rejection: authRejection } = await server.authenticate(
        entry.authorization ?? undefined,
      );
      const rejection = authRejection ?? check(user);

      if (entry.expect.status === 200) {
        expect(rejection).toBeUndefined();
        return;
      }

      expect(rejection.status).toBe(entry.expect.status);
      expect({ error: rejection.errorCode, ...rejection.detail }).toEqual(
        entry.expect.body,
      );
      expect(rejection.headers?.["WWW-Authenticate"] ?? null).toBe(
        entry.expect.www_authenticate,
      );
    },
  );
});

describe("createResourceServer", () => {
  it("refuses an empty audience or a non-URL issuer at setup", () => {
    expect(() =>
      createResourceServer({ issuer: vectors.issuer, audience: "" }),
    ).toThrow(/audience/);
    expect(() =>
      createResourceServer({ issuer: "login.example.test", audience: "a" }),
    ).toThrow(/issuer/);
    expect(() =>
      createResourceServer({
        issuer: vectors.issuer,
        audience: "a",
        jwksUri: "file:///k",
      }),
    ).toThrow(/jwksUri/);
  });

  it("refuses a step-up requirement that asks for nothing, or a negative maxAge", () => {
    const server = vectorServer();
    expect(() => server.stepUp({})).toThrow(/acrValues, amr or maxAge/);
    expect(() => server.stepUp({ acrValues: [] })).toThrow(/empty lists/);
    expect(() => server.stepUp({ amr: [], maxAge: 60 })).toThrow(/empty lists/);
    expect(() => server.stepUp({ maxAge: -1 })).toThrow(/maxAge/);
    expect(() => server.stepUp({ maxAge: 1.5 })).toThrow(/maxAge/);
  });

  it("accepts a cnf-bound token only when the confirmation hook does", async () => {
    const token = vectors.tokens.cnf_bound;
    const seen = [];
    const accepting = vectorServer({
      confirm: (cnf) => {
        seen.push(cnf);
        return true;
      },
    });
    const refusing = vectorServer({ confirm: async () => false });

    expect(await accepting.verify(token)).not.toBeNull();
    expect(seen).toEqual([
      { jkt: "0ZcOCORZNYy-DWpqq30jZyJGHTN0d2HglBV3uiguA4I" },
    ]);
    expect(await refusing.verify(token)).toBeNull();
  });

  it("treats a guard reached without a user as a missing token", () => {
    const server = vectorServer();
    expect(server.authorizeScopes(undefined, "a")).toMatchObject({
      status: 401,
      errorCode: "missing_token",
    });
    expect(server.authorizeRoles(undefined, "a").errorCode).toBe(
      "missing_token",
    );
    expect(server.stepUp({ maxAge: 1 })(undefined).errorCode).toBe(
      "missing_token",
    );
  });
});

const { privateKey, publicKey } = await generateKeyPair("RS256");
const jwk = {
  ...(await exportJWK(publicKey)),
  alg: "RS256",
  kid: "d1",
  use: "sig",
};

describe("setup and claim edge cases", () => {
  const key = createPrivateKey(
    readFileSync(
      new URL("./fixtures/verify-only/vo-1.test-only.pem", import.meta.url),
    ),
  );

  // Raw payload text, so values JSON.stringify cannot write (1e999) reach the verifier.
  function signRaw(payloadText) {
    const header = Buffer.from(
      JSON.stringify({ alg: "RS256", kid: "vo-1", typ: "at+jwt" }),
    ).toString("base64url");
    const input = `${header}.${Buffer.from(payloadText).toString("base64url")}`;
    return `${input}.${sign("sha256", Buffer.from(input), key).toString("base64url")}`;
  }

  const claims = {
    iss: vectors.issuer,
    aud: vectors.audience,
    exp: vectors.now + 60,
    sub: "user-1",
    client_id: "app",
  };

  it("refuses scope and role guards that require nothing", () => {
    const server = vectorServer();
    expect(() => server.scopes([])).toThrow(/requireScope/);
    expect(() => server.scopes("")).toThrow(/requireScope/);
    expect(() => server.roles([])).toThrow(/requireRole/);
    expect(() => server.roles(["admin", ""])).toThrow(/requireRole/);
  });

  it("refuses non-finite times", async () => {
    const server = vectorServer();
    const base = JSON.stringify(claims).slice(0, -1);

    expect(await server.verify(signRaw(JSON.stringify(claims)))).not.toBeNull();
    expect(await server.verify(signRaw(`${base},"exp":1e999}`))).toBeNull();
    expect(await server.verify(signRaw(`${base},"nbf":-1e999}`))).toBeNull();
    expect(
      await server.verify(signRaw(`${base},"auth_time":1e999}`)),
    ).toBeNull();
    expect(
      await server.verify(signRaw(`${base},"auth_time":true}`)),
    ).toBeNull();
  });

  it("treats null claims as the wrong type, except org_id and cnf", async () => {
    const server = vectorServer();
    for (const name of [
      "sid",
      "acr",
      "amr",
      "roles",
      "scope",
      "auth_time",
      "nbf",
    ]) {
      expect(
        await server.verify(
          signRaw(JSON.stringify({ ...claims, [name]: null })),
        ),
      ).toBeNull();
    }
    expect(
      await server.verify(
        signRaw(JSON.stringify({ ...claims, org_id: null, cnf: null })),
      ),
    ).not.toBeNull();
  });
});

describe("discovery", () => {
  const realFetch = global.fetch;

  let issuerCount = 0;
  function nextIssuer() {
    issuerCount += 1;
    return `https://login-${issuerCount}.example.test`;
  }

  function json(body, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }

  function mockProvider(issuer, doc) {
    const calls = [];
    global.fetch = jest.fn(async (url) => {
      const href = url.toString();
      calls.push(href);
      if (href === `${issuer}/.well-known/openid-configuration`) return doc();
      if (href === `${issuer}/jwks`) return json({ keys: [jwk] });
      throw new Error(`Unexpected fetch URL: ${href}`);
    });
    return calls;
  }

  function sign(issuer) {
    return new SignJWT({ client_id: "app", scope: "a" })
      .setProtectedHeader({ alg: "RS256", kid: "d1", typ: "at+jwt" })
      .setIssuer(issuer)
      .setAudience("https://api.example.test")
      .setSubject("user-1")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);
  }

  afterEach(() => {
    global.fetch = realFetch;
  });

  it("finds the key set through the issuer's discovery document, once", async () => {
    const issuer = nextIssuer();
    const calls = mockProvider(issuer, () =>
      json({ issuer, jwks_uri: `${issuer}/jwks` }),
    );
    const server = createResourceServer({
      issuer,
      audience: "https://api.example.test",
    });

    expect((await server.verify(await sign(issuer)))?.id).toBe("user-1");
    expect((await server.verify(await sign(issuer)))?.id).toBe("user-1");
    expect(
      calls.filter((url) => url.endsWith("openid-configuration")),
    ).toHaveLength(1);
  });

  it("refuses a discovery document for a different issuer", async () => {
    const issuer = nextIssuer();
    mockProvider(issuer, () =>
      json({ issuer: `${issuer}/`, jwks_uri: `${issuer}/jwks` }),
    );
    const server = createResourceServer({
      issuer,
      audience: "https://api.example.test",
    });

    expect(await server.verify(await sign(issuer))).toBeNull();
  });

  it("refuses an http jwks_uri under an https issuer", async () => {
    const issuer = nextIssuer();
    mockProvider(issuer, () =>
      json({ issuer, jwks_uri: `${issuer.replace("https:", "http:")}/jwks` }),
    );
    const server = createResourceServer({
      issuer,
      audience: "https://api.example.test",
    });

    expect(await server.verify(await sign(issuer))).toBeNull();
  });

  it("answers 401 when discovery fails, and holds off the next attempt", async () => {
    const issuer = nextIssuer();
    const calls = mockProvider(issuer, () => json({ error: "down" }, 503));
    const server = createResourceServer({
      issuer,
      audience: "https://api.example.test",
    });
    const authorization = `Bearer ${await sign(issuer)}`;

    expect((await server.authenticate(authorization)).rejection).toMatchObject({
      status: 401,
      errorCode: "invalid_token",
    });
    await server.authenticate(authorization);
    expect(calls).toHaveLength(1);
  });

  it("refuses an oversized discovery document", async () => {
    const issuer = nextIssuer();
    mockProvider(issuer, () =>
      json({
        issuer,
        jwks_uri: `${issuer}/jwks`,
        padding: "x".repeat(300 * 1024),
      }),
    );
    const server = createResourceServer({
      issuer,
      audience: "https://api.example.test",
    });

    expect(await server.verify(await sign(issuer))).toBeNull();
  });

  it("skips discovery when jwksUri is given", async () => {
    const issuer = nextIssuer();
    const calls = mockProvider(issuer, () => json({}, 404));
    const server = createResourceServer({
      issuer,
      audience: "https://api.example.test",
      jwksUri: `${issuer}/jwks`,
    });

    expect((await server.verify(await sign(issuer)))?.id).toBe("user-1");
    expect(calls).toEqual([`${issuer}/jwks`]);
  });
});
