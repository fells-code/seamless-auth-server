import { definePermissionGuardSuite, providerConfig } from "../../core/tests/fixtures/permissionGuardSuite.js";

const { createResourceServer, requirePermission, setSeamlessLogger } = await import(
  "../dist/index.js"
);

let warnings = [];
setSeamlessLogger({
  warn: (message) => warnings.push(message),
  error: () => {},
});
beforeEach(() => {
  warnings = [];
});

const reply = (_request, _context, user) => Response.json({ user });

// `params` is a promise from Next.js 15 and a plain object before it.
const promised = (params) => ({ params: Promise.resolve(params) });
const plain = (params) => ({ params });

async function run(route, headers, context) {
  const res = await route(new Request("https://app.example.com/guarded", { headers }), context);
  return { status: res.status, body: await res.json() };
}

const paramsOf = (organizationId) =>
  organizationId === undefined ? {} : { organizationId };

const harness = (name, transports, contextFor) =>
  definePermissionGuardSuite(name, {
    transports,
    warnings: () => warnings,
    send({ config, headers, required, options, organizationId }) {
      return run(
        requirePermission(required, reply, { ...config, ...options }),
        headers,
        contextFor(paramsOf(organizationId)),
      );
    },
    sendVerifyOnly({ token, required, options, organizationId }) {
      const api = createResourceServer(providerConfig);
      return run(
        api.protect(reply, { permissions: required, permissionOptions: options }),
        token ? { authorization: `Bearer ${token}` } : {},
        contextFor(paramsOf(organizationId)),
      );
    },
  });

// Its guards always verify the inner token, so there is no cookie-only form.
harness("Next.js", ["cookie", "bearer"], promised);
harness("Next.js with plain params", ["bearer"], plain);
harness("Next.js with no route context", ["bearer"], ({ organizationId }) =>
  organizationId === undefined ? undefined : promised({ organizationId }),
);

describe("requirePermission route context", () => {
  const config = {
    cookieSecret: "cookie-secret-cookie-secret-cookie-secret",
    authServerUrl: "https://auth.example.com",
    audience: "https://auth.example.com",
  };

  it("does not throw at module load on an empty list", () => {
    expect(() => requirePermission([], reply, config)).not.toThrow();
  });

  it("answers a resource server's authenticate with no token as a 401", async () => {
    const api = createResourceServer(providerConfig);

    const result = await api.authenticate(
      new Request("https://app.example.com/guarded"),
      { permissions: "a:read", permissionOptions: { organizationParam: "organizationId" } },
    );

    expect(result.response.status).toBe(401);
  });
});
