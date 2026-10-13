// Resolves "@seamless-auth/nextjs" by name through package.json `exports`, so
// it sees the built dist exactly as an installed consumer does.
import {
  createSeamlessAuthHandler,
  getSeamlessClaims,
  getSeamlessSession,
  type SeamlessSession,
} from "@seamless-auth/nextjs";

const cookies = { get: (_name: string) => undefined };
const options = {
  authServerUrl: "https://auth.example.com",
  cookieSecret: "x".repeat(64),
  serviceSecret: "y".repeat(64),
  audience: "https://auth.example.com",
  jwksKid: "main",
};

const handlers = createSeamlessAuthHandler(options);
const get: (request: Request) => Promise<Response> = handlers.GET;
const session: Promise<SeamlessSession | null> = getSeamlessSession(
  cookies,
  options,
);
void get;
void session;

// Each wrong call below must be a type error. If an export resolves to `any`
// (an unresolvable import in the shipped .d.ts), the directive is unused and
// tsc fails.
// @ts-expect-error createSeamlessAuthHandler takes an options object
createSeamlessAuthHandler(42);
// @ts-expect-error getSeamlessSession takes a cookie reader and options
getSeamlessSession(42);
// @ts-expect-error getSeamlessClaims takes a cookie reader and options
getSeamlessClaims(42);
