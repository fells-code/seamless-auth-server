// Writes vectors.json: the signed tokens and expected outcomes every Seamless
// adapter's verify-only mode is tested against (Express, Fastify and Next.js
// here, and the Go, Python and Rust adapters, which copy vectors.json).
//
// RS256 signatures are deterministic, so rerunning with the committed keys
// reproduces the file byte for byte. The keys are test-only.
//
//   node packages/core/tests/fixtures/verify-only/generate.mjs

import {
  createHmac,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
} from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));

const ISSUER = "https://login.example.test";
const AUDIENCE = "https://api.example.test";
const NOW = 1798761600;

function loadKey(name) {
  const path = join(dir, `${name}.test-only.pem`);
  if (!existsSync(path)) {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    writeFileSync(path, privateKey.export({ type: "pkcs8", format: "pem" }));
  }
  return createPrivateKey(readFileSync(path));
}

const keys = {
  "vo-1": loadKey("vo-1"),
  "vo-2": loadKey("vo-2"),
  "vo-enc": loadKey("vo-enc"),
  "vo-rs512": loadKey("vo-rs512"),
  untrusted: loadKey("untrusted"),
};

function publicJwk(kid, extra) {
  const { kty, n, e } = createPublicKey(keys[kid]).export({ format: "jwk" });
  return { kty, kid, n, e, ...extra };
}

const jwks = {
  keys: [
    publicJwk("vo-1", { alg: "RS256", use: "sig" }),
    publicJwk("vo-2", { alg: "RS256" }),
    publicJwk("vo-enc", { alg: "RS256", use: "enc" }),
    publicJwk("vo-rs512", { alg: "RS512", use: "sig" }),
  ],
};

const b64 = (value) =>
  Buffer.from(
    typeof value === "string" ? value : JSON.stringify(value),
  ).toString("base64url");

function jws(header, payload, { key = "vo-1", hmacSecret } = {}) {
  const input = `${b64(header)}.${b64(payload)}`;
  if (header.alg === "none") return `${input}.`;
  const signature = hmacSecret
    ? createHmac("sha256", hmacSecret).update(input).digest()
    : sign("sha256", Buffer.from(input), keys[key]);
  return `${input}.${signature.toString("base64url")}`;
}

const header = (extra = {}) => ({
  alg: "RS256",
  kid: "vo-1",
  typ: "at+jwt",
  ...extra,
});

const base = {
  iss: ISSUER,
  aud: AUDIENCE,
  exp: NOW + 3600,
  iat: NOW - 120,
  jti: "jti-1",
};

const passkeyUser = {
  ...base,
  sub: "user-123",
  client_id: "app-web",
  scope: "openid orders:read orders:write",
  sid: "sess-1",
  org_id: "org-9",
  roles: ["orders:write", "member"],
  acr: "phrh",
  amr: ["hwk", "user", "mfa"],
  auth_time: NOW - 120,
};

const otpUser = {
  ...base,
  sub: "user-456",
  client_id: "app-web",
  scope: "orders:read",
  sid: "sess-2",
  roles: ["member"],
  amr: ["otp"],
  auth_time: NOW - 120,
};

const stalePasskeyUser = {
  ...base,
  sub: "user-789",
  client_id: "app-web",
  scope: "orders:read",
  sid: "sess-3",
  roles: ["orders:read"],
  acr: "phr",
  amr: ["swk", "user", "mfa"],
  auth_time: NOW - 600,
};

const without = (claims, ...names) =>
  Object.fromEntries(
    Object.entries(claims).filter(([k]) => !names.includes(k)),
  );

const valid = jws(header(), passkeyUser);
const [validHeader, , validSignature] = valid.split(".");

const tokens = {
  user_passkey: valid,
  user_otp: jws(header(), otpUser),
  user_stale_passkey: jws(header(), stalePasskeyUser),
  user_no_auth_time: jws(header(), without(stalePasskeyUser, "auth_time")),
  client_credentials: jws(header(), {
    ...base,
    sub: "svc-reports",
    client_id: "svc-reports",
    scope: "reports:read",
  }),
  aud_array: jws(header(), {
    ...otpUser,
    aud: ["https://other.example.test", AUDIENCE],
  }),
  typ_application: jws(header({ typ: "application/at+jwt" }), otpUser),
  typ_uppercase: jws(header({ typ: "AT+JWT" }), otpUser),
  exp_within_skew: jws(header(), { ...otpUser, exp: NOW - 3 }),
  nbf_within_skew: jws(header(), { ...otpUser, nbf: NOW + 3 }),
  rotated_key: jws(header({ kid: "vo-2" }), otpUser, { key: "vo-2" }),
  org_id_null: jws(header(), { ...otpUser, org_id: null }),
  unknown_claims: jws(header(), {
    ...otpUser,
    email: "a@example.test",
    extra: { x: 1 },
  }),

  wrong_aud: jws(header(), { ...otpUser, aud: "https://other.example.test" }),
  aud_array_without: jws(header(), {
    ...otpUser,
    aud: ["https://other.example.test"],
  }),
  aud_missing: jws(header(), without(otpUser, "aud")),
  wrong_iss: jws(header(), { ...otpUser, iss: "https://evil.example.test" }),
  iss_trailing_slash: jws(header(), { ...otpUser, iss: `${ISSUER}/` }),
  iss_missing: jws(header(), without(otpUser, "iss")),
  expired: jws(header(), { ...otpUser, exp: NOW - 60 }),
  exp_missing: jws(header(), without(otpUser, "exp")),
  exp_string: jws(header(), { ...otpUser, exp: String(NOW + 3600) }),
  nbf_future: jws(header(), { ...otpUser, nbf: NOW + 60 }),
  sub_missing: jws(header(), without(otpUser, "sub")),
  sub_empty: jws(header(), { ...otpUser, sub: "" }),
  client_id_missing: jws(header(), without(otpUser, "client_id")),
  client_id_empty: jws(header(), { ...otpUser, client_id: "" }),
  typ_jwt: jws(header({ typ: "JWT" }), otpUser),
  typ_missing: jws(without(header(), "typ"), otpUser),
  alg_none: jws({ alg: "none", kid: "vo-1", typ: "at+jwt" }, otpUser),
  alg_hs256: jws({ alg: "HS256", kid: "vo-1", typ: "at+jwt" }, otpUser, {
    hmacSecret: JSON.stringify(jwks.keys[0]),
  }),
  alg_rs512_header: jws(header({ alg: "RS512" }), otpUser),
  kid_unknown: jws(header({ kid: "vo-missing" }), otpUser),
  kid_missing: jws(without(header(), "kid"), otpUser),
  untrusted_key: jws(header(), otpUser, { key: "untrusted" }),
  tampered_payload: `${validHeader}.${b64({ ...passkeyUser, roles: ["admin"] })}.${validSignature}`,
  key_use_enc: jws(header({ kid: "vo-enc" }), otpUser, { key: "vo-enc" }),
  key_alg_rs512: jws(header({ kid: "vo-rs512" }), otpUser, { key: "vo-rs512" }),
  crit_header: jws(header({ crit: ["exp"] }), otpUser),
  cnf_bound: jws(header(), {
    ...otpUser,
    cnf: { jkt: "0ZcOCORZNYy-DWpqq30jZyJGHTN0d2HglBV3uiguA4I" },
  }),
  first_party_typ: jws(header(), { ...otpUser, typ: "access" }),
  scope_array: jws(header(), { ...otpUser, scope: ["orders:read"] }),
  amr_string: jws(header(), { ...otpUser, amr: "otp" }),
  acr_number: jws(header(), { ...otpUser, acr: 1 }),
  auth_time_string: jws(header(), { ...otpUser, auth_time: String(NOW - 120) }),
  roles_string: jws(header(), { ...otpUser, roles: "member" }),
  sid_number: jws(header(), { ...otpUser, sid: 7 }),
  malformed: "not-a-jwt",
  two_segments: `${validHeader}.${b64(passkeyUser)}`,
};

const user = (claims) => ({
  sub: claims.sub,
  client_id: claims.client_id,
  scopes: claims.scope ? claims.scope.split(" ") : [],
  roles: claims.roles ?? [],
  sid: claims.sid ?? null,
  org_id: claims.org_id ?? null,
  acr: claims.acr ?? null,
  amr: claims.amr ?? [],
  auth_time: claims.auth_time ?? null,
});

const accepted = {
  user_passkey: passkeyUser,
  user_otp: otpUser,
  user_stale_passkey: stalePasskeyUser,
  user_no_auth_time: without(stalePasskeyUser, "auth_time"),
  client_credentials: {
    sub: "svc-reports",
    client_id: "svc-reports",
    scope: "reports:read",
  },
  aud_array: otpUser,
  typ_application: otpUser,
  typ_uppercase: otpUser,
  exp_within_skew: otpUser,
  nbf_within_skew: otpUser,
  rotated_key: otpUser,
  org_id_null: otpUser,
  unknown_claims: otpUser,
};

const verify = Object.keys(tokens).map((name) =>
  name in accepted
    ? { name, valid: true, user: user(accepted[name]) }
    : { name, valid: false },
);

const DIFFERENT = "A different authentication level is required";
const RECENT = "More recent authentication is required";

const ok = { status: 200, body: null, www_authenticate: null };
const missing = {
  status: 401,
  body: { error: "missing_token" },
  www_authenticate: "Bearer",
};
const invalid = {
  status: 401,
  body: { error: "invalid_token" },
  www_authenticate: 'Bearer error="invalid_token"',
};
const scopeDenied = (scope) => ({
  status: 403,
  body: { error: "insufficient_scope", scope },
  www_authenticate: `Bearer error="insufficient_scope", scope="${scope}"`,
});
const roleDenied = {
  status: 403,
  body: { error: "insufficient_role" },
  www_authenticate: null,
};

function stepUpDenied(description, guard) {
  const body = {
    error: "insufficient_user_authentication",
    error_description: description,
  };
  let challenge = `Bearer error="insufficient_user_authentication", error_description="${description}"`;
  if (guard.acr_values) {
    body.acr_values = guard.acr_values.join(" ");
    challenge += `, acr_values="${body.acr_values}"`;
  }
  if (guard.max_age !== undefined) {
    body.max_age = guard.max_age;
    challenge += `, max_age="${guard.max_age}"`;
  }
  return { status: 401, body, www_authenticate: challenge };
}

const bearer = (name) => `Bearer ${tokens[name]}`;
const recentPasskey = { kind: "step_up", acr_values: ["phr"], max_age: 300 };

const requests = [
  {
    name: "no_authorization",
    authorization: null,
    guard: null,
    expect: missing,
  },
  {
    name: "basic_scheme",
    authorization: "Basic dXNlcjpwYXNz",
    guard: null,
    expect: missing,
  },
  {
    name: "bearer_without_token",
    authorization: "Bearer",
    guard: null,
    expect: missing,
  },
  {
    name: "bearer_two_tokens",
    authorization: `Bearer ${tokens.user_otp} extra`,
    guard: null,
    expect: missing,
  },
  {
    name: "lowercase_scheme",
    authorization: `bearer ${tokens.user_otp}`,
    guard: null,
    expect: ok,
  },
  { name: "valid", authorization: bearer("user_otp"), guard: null, expect: ok },
  {
    name: "expired",
    authorization: bearer("expired"),
    guard: null,
    expect: invalid,
  },
  {
    name: "invalid_token_before_scope",
    authorization: bearer("wrong_aud"),
    guard: { kind: "scope", scopes: ["orders:read"] },
    expect: invalid,
  },
  {
    name: "missing_token_before_step_up",
    authorization: null,
    guard: recentPasskey,
    expect: missing,
  },

  {
    name: "scope_present",
    authorization: bearer("user_passkey"),
    guard: { kind: "scope", scopes: ["orders:write"] },
    expect: ok,
  },
  {
    name: "scope_absent",
    authorization: bearer("user_otp"),
    guard: { kind: "scope", scopes: ["orders:write"] },
    expect: scopeDenied("orders:write"),
  },
  {
    name: "scope_all_required",
    authorization: bearer("user_otp"),
    guard: { kind: "scope", scopes: ["orders:read", "orders:write"] },
    expect: scopeDenied("orders:read orders:write"),
  },
  {
    name: "scope_exact_match_only",
    authorization: bearer("user_passkey"),
    guard: { kind: "scope", scopes: ["orders"] },
    expect: scopeDenied("orders"),
  },
  {
    name: "scope_client_credentials",
    authorization: bearer("client_credentials"),
    guard: { kind: "scope", scopes: ["reports:read"] },
    expect: ok,
  },

  {
    name: "role_write_implies_read",
    authorization: bearer("user_passkey"),
    guard: { kind: "role", roles: ["orders:read"] },
    expect: ok,
  },
  {
    name: "role_any_of",
    authorization: bearer("user_passkey"),
    guard: { kind: "role", roles: ["admin", "member"] },
    expect: ok,
  },
  {
    name: "role_absent",
    authorization: bearer("user_otp"),
    guard: { kind: "role", roles: ["admin"] },
    expect: roleDenied,
  },
  {
    name: "role_read_does_not_imply_write",
    authorization: bearer("user_stale_passkey"),
    guard: { kind: "role", roles: ["orders:write"] },
    expect: roleDenied,
  },
  {
    name: "role_unscoped_grants_beneath",
    authorization: bearer("user_otp"),
    guard: { kind: "role", roles: ["member:billing"] },
    expect: ok,
  },
  {
    name: "role_client_without_roles",
    authorization: bearer("client_credentials"),
    guard: { kind: "role", roles: ["member"] },
    expect: roleDenied,
  },

  {
    name: "step_up_recent_device_bound_passkey",
    authorization: bearer("user_passkey"),
    guard: recentPasskey,
    expect: ok,
  },
  {
    name: "step_up_stale_passkey",
    authorization: bearer("user_stale_passkey"),
    guard: recentPasskey,
    expect: stepUpDenied(RECENT, recentPasskey),
  },
  {
    name: "step_up_otp_only",
    authorization: bearer("user_otp"),
    guard: recentPasskey,
    expect: stepUpDenied(DIFFERENT, recentPasskey),
  },
  {
    name: "step_up_no_auth_time",
    authorization: bearer("user_no_auth_time"),
    guard: { kind: "step_up", max_age: 300 },
    expect: stepUpDenied(RECENT, { max_age: 300 }),
  },
  {
    name: "step_up_phrh_required",
    authorization: bearer("user_passkey"),
    guard: { kind: "step_up", acr_values: ["phrh"] },
    expect: ok,
  },
  {
    name: "step_up_phr_does_not_satisfy_phrh",
    authorization: bearer("user_stale_passkey"),
    guard: { kind: "step_up", acr_values: ["phrh"] },
    expect: stepUpDenied(DIFFERENT, { acr_values: ["phrh"] }),
  },
  {
    name: "step_up_amr_present",
    authorization: bearer("user_passkey"),
    guard: { kind: "step_up", amr: ["hwk"] },
    expect: ok,
  },
  {
    name: "step_up_amr_absent",
    authorization: bearer("user_otp"),
    guard: { kind: "step_up", amr: ["hwk"] },
    expect: stepUpDenied(DIFFERENT, {}),
  },
  {
    name: "step_up_amr_all_required",
    authorization: bearer("user_stale_passkey"),
    guard: { kind: "step_up", amr: ["swk", "hwk"] },
    expect: stepUpDenied(DIFFERENT, {}),
  },
  {
    name: "step_up_client_credentials",
    authorization: bearer("client_credentials"),
    guard: { kind: "step_up", max_age: 300 },
    expect: stepUpDenied(RECENT, { max_age: 300 }),
  },
  {
    name: "step_up_max_age_zero",
    authorization: bearer("user_passkey"),
    guard: { kind: "step_up", max_age: 0 },
    expect: stepUpDenied(RECENT, { max_age: 0 }),
  },
];

const vectors = {
  version: 1,
  issuer: ISSUER,
  audience: AUDIENCE,
  now: NOW,
  clock_skew_seconds: 5,
  jwks,
  tokens,
  verify,
  requests,
};

writeFileSync(
  join(dir, "vectors.json"),
  `${JSON.stringify(vectors, null, 2)}\n`,
);
