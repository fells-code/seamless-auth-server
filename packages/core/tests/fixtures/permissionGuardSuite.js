// The permission guard contract, run against each framework's guards so the
// three cannot disagree. A harness builds a real route and sends a real request:
//
//   transports: which of "cookie-only", "cookie" and "bearer" the framework has
//   send({ config, headers, required, options, organizationId }) => { status, body }
//   sendVerifyOnly({ token, required, options, organizationId }) => { status, body }
//   warnings() => string[]
//
// `organizationId` undefined means the route has no such parameter.
import jwt from "jsonwebtoken";
import { exportJWK, generateKeyPair, SignJWT } from "jose";

export const COOKIE_SECRET = "cookie-secret-cookie-secret-cookie-secret";
const ISSUER = "https://provider.example.com";
const AUDIENCE = "https://api.example.com";

const { privateKey, publicKey } = await generateKeyPair("RS256");
const jwk = {
  ...(await exportJWK(publicKey)),
  alg: "RS256",
  kid: "k1",
  use: "sig",
};

export const providerConfig = {
  issuer: ISSUER,
  audience: AUDIENCE,
  jwks: { keys: [jwk] },
};

const INSUFFICIENT = { error: "insufficient_permission" };
const UNAVAILABLE = { error: "permissions_unavailable" };
const UNAUTHENTICATED = { error: "unauthenticated" };

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const live = (overrides = {}) => ({
  roles: [],
  permissions: [],
  organizationId: null,
  organizationRoles: [],
  organizationPermissions: [],
  ...overrides,
});

let serverCount = 0;

export function definePermissionGuardSuite(name, harness) {
  serverCount += 1;
  const server = `https://${name.toLowerCase().replace(/\W/g, "-")}-${serverCount}.example.com`;

  const accessToken = (claims = {}) =>
    new SignJWT({ sub: "user-1", typ: "access", roles: [], ...claims })
      .setProtectedHeader({ alg: "RS256", kid: "k1" })
      .setIssuer(server)
      .setAudience(server)
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);

  const verified = {
    cookieSecret: COOKIE_SECRET,
    authServerUrl: server,
    audience: server,
  };

  const TRANSPORTS = {
    "cookie-only": {
      config: { cookieSecret: COOKIE_SECRET },
      // A cookie-only requireAuth holds no URL, so the guard has to be given one.
      liveOptions: { authServerUrl: server },
      async headers(claims) {
        const cookie = jwt.sign(
          { sub: "user-1", roles: [], token: await accessToken(claims) },
          COOKIE_SECRET,
          { algorithm: "HS256" },
        );
        return { cookie: `seamless-access=${cookie}` };
      },
    },
    cookie: {
      config: verified,
      liveOptions: {},
      async headers(claims) {
        const cookie = jwt.sign(
          { sub: "user-1", roles: [], token: await accessToken(claims) },
          COOKIE_SECRET,
          { algorithm: "HS256" },
        );
        return { cookie: `seamless-access=${cookie}` };
      },
    },
    bearer: {
      config: verified,
      liveOptions: {},
      async headers(claims) {
        return { authorization: `Bearer ${await accessToken(claims)}` };
      },
    },
  };

  describe(`${name} requirePermission`, () => {
    const originalFetch = global.fetch;
    let liveCalls;
    let answerLive;

    beforeEach(() => {
      liveCalls = [];
      answerLive = async () => {
        throw new Error("the guard should not have asked the auth API");
      };
      global.fetch = async (url, init) => {
        const href = url.toString();
        if (href === `${server}/.well-known/jwks.json`) {
          return json({ keys: [jwk] });
        }
        if (href === `${server}/users/me/permissions`) {
          liveCalls.push(init);
          return answerLive();
        }
        throw new Error(`Unexpected fetch URL: ${href}`);
      };
    });

    afterEach(() => {
      global.fetch = originalFetch;
    });

    describe.each(harness.transports)("over %s", (transport) => {
      const { config, liveOptions, headers } = TRANSPORTS[transport];

      async function send(claims, required, options = {}, organizationId) {
        return harness.send({
          config,
          headers: await headers(claims),
          required,
          options,
          organizationId,
        });
      }

      const sendOmitted = (required, options = {}, organizationId, claims) =>
        send(
          { permissions_omitted: true, ...claims },
          required,
          { ...liveOptions, ...options },
          organizationId,
        );

      describe("authentication", () => {
        it("answers the existing 401 with no credential", async () => {
          const res = await harness.send({
            config,
            headers: {},
            required: "a:read",
          });

          expect(res.status).toBe(401);
          expect(res.body).toEqual(UNAUTHENTICATED);
        });

        it("answers the existing recovery rejection", async () => {
          const res = await send({ recovery: true, permissions: ["a:read"] }, "a:read");

          expect(res.status).toBe(403);
          expect(res.body).toEqual({ error: "enrollment_required" });
        });
      });

      describe("any (the default)", () => {
        it.each([
          ["the permission in permissions", { permissions: ["a:read"] }, "a:read"],
          ["the permission in org_permissions", { org_permissions: ["a:read"] }, "a:read"],
          ["one of a list", { permissions: ["b:read"] }, ["a:read", "b:read"]],
        ])("passes holding %s", async (_label, claims, required) => {
          const res = await send(claims, required);

          expect(res.status).toBe(200);
        });

        it("passes with match: any spelled out", async () => {
          const res = await send({ permissions: ["b:read"] }, ["a:read", "b:read"], {
            match: "any",
          });

          expect(res.status).toBe(200);
        });

        it.each([
          ["none of them", { permissions: ["c:read"] }, ["a:read", "b:read"]],
          ["no claims at all", {}, "a:read"],
          ["a different case", { permissions: ["A:READ"] }, "a:read"],
          ["surrounding whitespace", { permissions: [" a:read "] }, "a:read"],
          ["a wildcard", { permissions: ["a:*", "*"] }, "a:read"],
          ["the write of a read", { permissions: ["a:write"] }, "a:read"],
          ["a parent name", { permissions: ["a"] }, "a:read"],
          ["only the role", { roles: ["a:read"] }, "a:read"],
          ["only the organization role", { org_roles: ["a:read"] }, "a:read"],
        ])("refuses holding %s, naming nothing", async (_label, claims, required) => {
          const res = await send(claims, required);

          expect(res.status).toBe(403);
          expect(res.body).toEqual(INSUFFICIENT);
        });
      });

      describe("all", () => {
        it("passes holding every one, from either claim", async () => {
          const res = await send(
            { permissions: ["a:read"], org_permissions: ["b:read"] },
            ["a:read", "b:read"],
            { match: "all" },
          );

          expect(res.status).toBe(200);
        });

        it("refuses when one is missing", async () => {
          const res = await send({ permissions: ["a:read"] }, ["a:read", "b:read"], {
            match: "all",
          });

          expect(res.status).toBe(403);
          expect(res.body).toEqual(INSUFFICIENT);
        });

        it("counts only the organization's permissions in organization scope", async () => {
          const res = await send(
            { org_id: "org-a", permissions: ["a:read"], org_permissions: ["b:read"] },
            ["a:read", "b:read"],
            { match: "all", organization: true },
          );

          expect(res.status).toBe(403);
        });
      });

      describe("a match that is neither any nor all", () => {
        it("refuses rather than weakening the check", async () => {
          const res = await send({ permissions: ["a:read"] }, "a:read", {
            match: "every",
          });

          expect(res.status).toBe(403);
          expect(res.body).toEqual(INSUFFICIENT);
        });
      });

      describe("organization scope", () => {
        it("passes on org_permissions with an active organization", async () => {
          const res = await send(
            { org_id: "org-a", org_permissions: ["a:read"] },
            "a:read",
            { organization: true },
          );

          expect(res.status).toBe(200);
        });

        it("does not count permissions", async () => {
          const res = await send({ org_id: "org-a", permissions: ["a:read"] }, "a:read", {
            organization: true,
          });

          expect(res.status).toBe(403);
          expect(res.body).toEqual(INSUFFICIENT);
        });

        it.each([
          ["no org_id", {}],
          ["an empty org_id", { org_id: "" }],
          ["a non-string org_id", { org_id: 7 }],
        ])("refuses %s", async (_label, claims) => {
          const res = await send({ org_permissions: ["a:read"], ...claims }, "a:read", {
            organization: true,
          });

          expect(res.status).toBe(403);
          expect(res.body).toEqual(INSUFFICIENT);
        });
      });

      describe("organization bound to the route", () => {
        const bound = { organizationParam: "organizationId" };
        const claims = { org_id: "org-a", org_permissions: ["a:read"] };

        it("passes when the parameter is the active organization", async () => {
          const res = await send(claims, "a:read", bound, "org-a");

          expect(res.status).toBe(200);
        });

        it("passes with organization: true as well", async () => {
          const res = await send(claims, "a:read", { ...bound, organization: true }, "org-a");

          expect(res.status).toBe(200);
        });

        it.each([
          ["another organization", "org-b"],
          ["a different case", "ORG-A"],
        ])("refuses %s", async (_label, organizationId) => {
          const res = await send(claims, "a:read", bound, organizationId);

          expect(res.status).toBe(403);
          expect(res.body).toEqual(INSUFFICIENT);
        });

        it("refuses a route without the parameter", async () => {
          const res = await send(claims, "a:read", bound);

          expect(res.status).toBe(403);
          expect(res.body).toEqual(INSUFFICIENT);
        });

        it("refuses when the parameter is named differently", async () => {
          const res = await send(claims, "a:read", { organizationParam: "orgId" }, "org-a");

          expect(res.status).toBe(403);
        });

        it("does not count permissions", async () => {
          const res = await send(
            { org_id: "org-a", permissions: ["a:read"] },
            "a:read",
            bound,
            "org-a",
          );

          expect(res.status).toBe(403);
        });

        it("refuses a token with no active organization", async () => {
          const res = await send({ org_permissions: ["a:read"] }, "a:read", bound, "org-a");

          expect(res.status).toBe(403);
        });
      });

      describe("an empty required list", () => {
        const holdsAll = {
          org_id: "org-a",
          permissions: ["a:read"],
          org_permissions: ["a:read"],
        };

        it.each([
          ["any", {}, undefined],
          ["all", { match: "all" }, undefined],
          ["organization scope", { organization: true }, undefined],
          ["bound organization", { organizationParam: "organizationId" }, "org-a"],
        ])("opens nothing in %s", async (_label, options, organizationId) => {
          const res = await send(holdsAll, [], options, organizationId);

          expect(res.status).toBe(403);
          expect(res.body).toEqual(INSUFFICIENT);
        });

        it("does not ask the auth API for an omitted token", async () => {
          const res = await sendOmitted([]);

          expect(res.status).toBe(403);
          expect(liveCalls).toHaveLength(0);
        });
      });

      describe("malformed claims", () => {
        it.each([
          ["a string permissions claim", { permissions: "a:read" }],
          ["an object permissions claim", { permissions: { 0: "a:read" } }],
          ["a null permissions claim", { permissions: null }],
          ["a string org_permissions claim", { org_permissions: "a:read" }],
          ["a list of non-strings", { permissions: [1, null, { a: "read" }, ["a:read"]] }],
        ])("reads %s as empty", async (_label, claims) => {
          const res = await send(claims, "a:read");

          expect(res.status).toBe(403);
          expect(res.body).toEqual(INSUFFICIENT);
        });

        it("ignores non-string entries and keeps the strings", async () => {
          const res = await send({ permissions: [1, null, "a:read"] }, "a:read");

          expect(res.status).toBe(200);
        });

        it("exposes the same reading on the user", async () => {
          const res = await send(
            { permissions: [1, "a:read"], org_roles: "admin", org_permissions: {} },
            "a:read",
          );

          expect(res.body.user).toMatchObject({
            permissions: ["a:read"],
            organizationRoles: [],
            organizationPermissions: [],
            permissionsOmitted: false,
          });
        });

        it.each([["true"], [1], [null]])(
          "treats a permissions_omitted of %j as absent, without asking",
          async (marker) => {
            const res = await send({ permissions_omitted: marker }, "a:read", liveOptions);

            expect(res.status).toBe(403);
            expect(liveCalls).toHaveLength(0);
          },
        );
      });

      describe("the user", () => {
        it("exposes the claims", async () => {
          const res = await send(
            {
              org_id: "org-a",
              permissions: ["a:read"],
              org_roles: ["admin"],
              org_permissions: ["b:read"],
            },
            "a:read",
          );

          expect(res.body.user).toMatchObject({
            permissions: ["a:read"],
            organizationRoles: ["admin"],
            organizationPermissions: ["b:read"],
            permissionsOmitted: false,
          });
        });

        it("marks an omitted token", async () => {
          answerLive = async () => json(live({ permissions: ["a:read"] }));

          const res = await sendOmitted("a:read");

          expect(res.status).toBe(200);
          expect(res.body.user).toMatchObject({
            permissions: [],
            organizationRoles: [],
            organizationPermissions: [],
            permissionsOmitted: true,
          });
        });

        it("does not ask the auth API when the token did not omit them", async () => {
          await send({ permissions: ["a:read"] }, "a:read");

          expect(liveCalls).toHaveLength(0);
        });
      });

      describe("a token that omits its permissions", () => {
        it("reads them with the caller's own token, and passes", async () => {
          answerLive = async () => json(live({ permissions: ["a:read"] }));
          const requestHeaders = await headers({ permissions_omitted: true });
          const res = await harness.send({
            config,
            headers: requestHeaders,
            required: "a:read",
            options: liveOptions,
          });

          expect(res.status).toBe(200);
          expect(liveCalls).toHaveLength(1);
          expect(liveCalls[0].method).toBe("GET");
          expect(liveCalls[0].headers.Authorization).toMatch(/^Bearer [\w-]+\.[\w-]+\.[\w-]+$/);
          expect(liveCalls[0].headers["x-seamless-service-token"]).toBeUndefined();
          if (requestHeaders.authorization) {
            expect(liveCalls[0].headers.Authorization).toBe(requestHeaders.authorization);
          }
        });

        it("refuses when the live answer does not hold it", async () => {
          answerLive = async () => json(live({ permissions: ["a:write"] }));

          const res = await sendOmitted("a:read");

          expect(res.status).toBe(403);
          expect(res.body).toEqual(INSUFFICIENT);
        });

        it("asks on every request, with no caching", async () => {
          answerLive = async () => json(live({ permissions: ["a:read"] }));

          await sendOmitted("a:read");
          await sendOmitted("a:read");

          expect(liveCalls).toHaveLength(2);
        });

        it("does not retry", async () => {
          answerLive = async () => json({}, 500);

          await sendOmitted("a:read");

          expect(liveCalls).toHaveLength(1);
        });

        it("applies all to the live answer, from either list", async () => {
          answerLive = async () =>
            json(live({ permissions: ["a:read"], organizationPermissions: ["b:read"] }));

          const res = await sendOmitted(["a:read", "b:read"], { match: "all" });

          expect(res.status).toBe(200);
        });

        it("applies organization scope to the live answer", async () => {
          answerLive = async () =>
            json(
              live({
                permissions: ["a:read"],
                organizationId: "org-a",
                organizationPermissions: ["b:read"],
              }),
            );

          const held = await sendOmitted("b:read", { organization: true }, undefined, {
            org_id: "org-a",
          });
          const notOrg = await sendOmitted("a:read", { organization: true }, undefined, {
            org_id: "org-a",
          });

          expect(held.status).toBe(200);
          expect(notOrg.status).toBe(403);
        });

        it("refuses organization scope when the live answer has no organization", async () => {
          answerLive = async () => json(live({ organizationPermissions: ["a:read"] }));

          const res = await sendOmitted("a:read", { organization: true }, undefined, {
            org_id: "org-a",
          });

          expect(res.status).toBe(403);
        });

        it("binds the route to the live organization", async () => {
          answerLive = async () =>
            json(live({ organizationId: "org-a", organizationPermissions: ["a:read"] }));
          const bound = { organizationParam: "organizationId" };

          const match = await sendOmitted("a:read", bound, "org-a");
          const mismatch = await sendOmitted("a:read", bound, "org-b");

          expect(match.status).toBe(200);
          expect(mismatch.status).toBe(403);
        });

        it("refuses a route without the parameter, without asking", async () => {
          const res = await sendOmitted("a:read", { organizationParam: "organizationId" });

          expect(res.status).toBe(403);
          expect(liveCalls).toHaveLength(0);
        });

        it("answers the existing 401 when the live read does", async () => {
          answerLive = async () => json({ error: "unauthorized" }, 401);

          const res = await sendOmitted("a:read");

          expect(res.status).toBe(401);
          expect(res.body).toEqual(UNAUTHENTICATED);
        });

        it.each([
          ["a 500", async () => json({ error: "boom" }, 500)],
          ["a 403", async () => json({ error: "forbidden" }, 403)],
          ["a 404", async () => json({ error: "not_found" }, 404)],
          ["a 429", async () => json({ error: "slow_down" }, 429)],
          ["a redirect", async () => new Response(null, { status: 302, headers: { location: "https://elsewhere.example.com/" } })],
          ["a network failure", async () => { throw new TypeError("fetch failed"); }],
          ["a timeout", async () => { throw Object.assign(new Error("timed out"), { name: "TimeoutError" }); }],
          ["no body", async () => new Response(null, { status: 204 })],
          ["a body that is not JSON", async () => new Response("<html>bad gateway</html>", { status: 200 })],
          ["a JSON array", async () => json([])],
          ["JSON null", async () => json(null)],
          ["no permissions list", async () => json({ organizationId: null, organizationPermissions: [] })],
          ["no organization permissions list", async () => json({ organizationId: null, permissions: ["a:read"] })],
          ["a permissions list that is a string", async () => json(live({ permissions: "a:read" }))],
          ["a permissions list holding a non-string", async () => json(live({ permissions: ["a:read", 1] }))],
          ["an organization id that is a number", async () => json(live({ permissions: ["a:read"], organizationId: 7 }))],
        ])("fails closed with a 503 on %s", async (_label, answer) => {
          answerLive = answer;

          const res = await sendOmitted("a:read");

          expect(res.status).toBe(503);
          expect(res.body).toEqual(UNAVAILABLE);
          expect(harness.warnings().join("\n")).toContain("live permission read");
        });
      });
    });

    if (harness.transports.includes("cookie-only")) {
      describe("with no auth server URL configured", () => {
        it("answers 503 and logs what to configure", async () => {
          const res = await harness.send({
            config: TRANSPORTS["cookie-only"].config,
            headers: await TRANSPORTS["cookie-only"].headers({
              permissions_omitted: true,
            }),
            required: "a:read",
          });

          expect(res.status).toBe(503);
          expect(res.body).toEqual(UNAVAILABLE);
          expect(liveCalls).toHaveLength(0);
          expect(harness.warnings().join("\n")).toContain(
            "authServerUrl on requirePermission",
          );
        });

        it("still decides a token that did not omit them", async () => {
          const res = await harness.send({
            config: TRANSPORTS["cookie-only"].config,
            headers: await TRANSPORTS["cookie-only"].headers({
              org_id: "org-a",
              org_permissions: ["a:read"],
            }),
            required: "a:read",
            options: { organization: true },
          });

          expect(res.status).toBe(200);
        });
      });
    }

    describe("verify-only", () => {
      const providerToken = (claims = {}) =>
        new SignJWT({ client_id: "client-1", sub: "user-1", ...claims })
          .setProtectedHeader({ alg: "RS256", kid: "k1", typ: "at+jwt" })
          .setIssuer(ISSUER)
          .setAudience(AUDIENCE)
          .setIssuedAt()
          .setExpirationTime("5m")
          .sign(privateKey);

      async function verifyOnly(claims, required, options, organizationId) {
        return harness.sendVerifyOnly({
          token: await providerToken(claims),
          required,
          options,
          organizationId,
        });
      }

      it("denies a provider token, which carries no such claims today", async () => {
        const res = await verifyOnly({ scope: "a:read" }, "a:read");

        expect(res.status).toBe(403);
        expect(res.body).toEqual(INSUFFICIENT);
      });

      it("answers the verifier's 401 with no token", async () => {
        const res = await harness.sendVerifyOnly({ required: "a:read" });

        expect(res.status).toBe(401);
        expect(res.body).toEqual({ error: "missing_token" });
      });

      it("treats permissions_omitted as a 403, without asking", async () => {
        const res = await verifyOnly(
          { permissions_omitted: true, permissions: ["a:read"] },
          "a:read",
        );

        expect(res.status).toBe(403);
        expect(res.body).toEqual(INSUFFICIENT);
        expect(liveCalls).toHaveLength(0);
      });

      it("refuses an empty list", async () => {
        const res = await verifyOnly({ permissions: ["a:read"] }, []);

        expect(res.status).toBe(403);
      });

      it("reads malformed claims as empty instead of refusing the token", async () => {
        const res = await verifyOnly({ permissions: "a:read", org_permissions: 7 }, "a:read");

        expect(res.status).toBe(403);
        expect(res.body).toEqual(INSUFFICIENT);
      });

      it("applies the same rules once the claims are there", async () => {
        const claims = {
          org_id: "org-a",
          permissions: ["a:read"],
          org_permissions: ["b:read"],
        };
        const bound = { organizationParam: "organizationId" };

        const results = await Promise.all([
          verifyOnly(claims, "a:read"),
          verifyOnly(claims, ["a:read", "b:read"], { match: "all" }),
          verifyOnly(claims, "b:read", { organization: true }),
          verifyOnly(claims, "b:read", bound, "org-a"),
          verifyOnly(claims, "a:read", { organization: true }),
          verifyOnly(claims, "b:read", bound, "org-b"),
          verifyOnly(claims, "b:read", bound),
          verifyOnly({ org_permissions: ["b:read"] }, "b:read", { organization: true }),
        ]);

        expect(results.map((res) => res.status)).toEqual([
          200, 200, 200, 200, 403, 403, 403, 403,
        ]);
      });
    });
  });
}
