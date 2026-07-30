// These values are defined by the auth API. Asserting them literally is the
// point: a change here is a coordinated change with seamless-auth-api, and this
// test is what makes that break loudly instead of at runtime.
import jwt from "jsonwebtoken";

const {
  AUTH_DELIVERY_MODE_HEADER,
  buildExternalDeliveryAuthorization,
  DEV_JWKS_KID,
  EXTERNAL_DELIVERY_HEADERS,
  EXTERNAL_DELIVERY_MODE,
  EXTERNAL_DELIVERY_TOKEN_SUBJECT,
  SERVICE_TOKEN_AUDIENCE,
  SERVICE_TOKEN_ISSUER,
} = await import("../dist/apiContract.js");

const SERVICE_SECRET = "service-secret-service-secret-service-secret";

describe("auth API contract values", () => {
  it("pins the external delivery header", () => {
    expect(AUTH_DELIVERY_MODE_HEADER).toBe("x-seamless-auth-delivery-mode");
    expect(EXTERNAL_DELIVERY_MODE).toBe("external");
    expect(EXTERNAL_DELIVERY_HEADERS).toEqual({
      "x-seamless-auth-delivery-mode": "external",
    });
  });

  it("pins the service token identity", () => {
    expect(SERVICE_TOKEN_ISSUER).toBe("seamless-portal-api");
    expect(SERVICE_TOKEN_AUDIENCE).toBe("seamless-auth");
    expect(DEV_JWKS_KID).toBe("dev-main");
  });

  it("does not let a caller mutate the shared header object", () => {
    expect(() => {
      EXTERNAL_DELIVERY_HEADERS["x-seamless-auth-delivery-mode"] = "internal";
    }).toThrow();
    expect(EXTERNAL_DELIVERY_HEADERS[AUTH_DELIVERY_MODE_HEADER]).toBe(
      "external",
    );
  });
});

describe("buildExternalDeliveryAuthorization", () => {
  it("mints a bearer token with the fixed service identity", () => {
    const authorization = buildExternalDeliveryAuthorization({
      serviceSecret: SERVICE_SECRET,
      jwksKid: "main-2026",
    });

    expect(authorization.startsWith("Bearer ")).toBe(true);

    const decoded = jwt.decode(authorization.slice("Bearer ".length), {
      complete: true,
    });

    expect(decoded.header).toMatchObject({ alg: "HS256", kid: "main-2026" });
    expect(decoded.payload).toMatchObject({
      iss: SERVICE_TOKEN_ISSUER,
      aud: SERVICE_TOKEN_AUDIENCE,
      sub: EXTERNAL_DELIVERY_TOKEN_SUBJECT,
    });
  });

  // The audience an adopter configures applies to user tokens. A service token
  // signed with it is rejected upstream.
  it("ignores any adopter audience and uses the service audience", () => {
    const authorization = buildExternalDeliveryAuthorization({
      serviceSecret: SERVICE_SECRET,
      jwksKid: "main-2026",
      audience: "https://adopter.example.com",
    });

    const { aud } = jwt.decode(authorization.slice("Bearer ".length));

    expect(aud).toBe(SERVICE_TOKEN_AUDIENCE);
  });

  it("falls back to the dev key id when none is configured", () => {
    const authorization = buildExternalDeliveryAuthorization({
      serviceSecret: SERVICE_SECRET,
    });

    const decoded = jwt.decode(authorization.slice("Bearer ".length), {
      complete: true,
    });

    expect(decoded.header.kid).toBe(DEV_JWKS_KID);
  });

  it("verifies against the service secret", () => {
    const authorization = buildExternalDeliveryAuthorization({
      serviceSecret: SERVICE_SECRET,
      jwksKid: "main-2026",
    });

    expect(() =>
      jwt.verify(authorization.slice("Bearer ".length), SERVICE_SECRET, {
        issuer: SERVICE_TOKEN_ISSUER,
        audience: SERVICE_TOKEN_AUDIENCE,
      }),
    ).not.toThrow();
  });
});
