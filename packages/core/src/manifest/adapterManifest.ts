import { getSeamlessLogger } from "../logger.js";
import { BUNDLED_ADAPTER_MANIFEST } from "./bundledManifest.js";

/**
 * The adapter manifest the auth API publishes at
 * `/.well-known/seamless-adapter.json`. It says, per route, which held token the
 * adapter sends and which tokens the response issues or clears, so a new API route
 * reaches adopters without a change to this package.
 */
export type AdapterCredential =
  | "none"
  | "preAuth"
  | "registration"
  | "access"
  | "refresh";

export type AdapterHeld = "preAuth" | "registration" | "access" | "refresh";

export type AdapterMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface AdapterManifestRoute {
  method: AdapterMethod;
  path: string;
  credential: AdapterCredential;
  /** `session` stores access and refresh; `access` reissues access only. */
  issues?: "preAuth" | "registration" | "session" | "access";
  clears?: AdapterHeld[];
  /** Cookie transport only: the body fields passed to the browser. */
  body?: { pick: string[] };
  delivery?: true;
}

export interface AdapterManifest {
  schemaVersion: 1;
  apiVersion: string;
  session: Record<string, string>;
  routes: AdapterManifestRoute[];
}

export const ADAPTER_MANIFEST_PATH = "/.well-known/seamless-adapter.json";

const METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);
const CREDENTIALS = new Set([
  "none",
  "preAuth",
  "registration",
  "access",
  "refresh",
]);
const ISSUES = new Set(["preAuth", "registration", "session", "access"]);
const HELD = new Set(["preAuth", "registration", "access", "refresh"]);

function isRoute(value: unknown): value is AdapterManifestRoute {
  if (!value || typeof value !== "object") return false;

  const route = value as Record<string, unknown>;

  return (
    METHODS.has(route.method as string) &&
    typeof route.path === "string" &&
    route.path.startsWith("/") &&
    CREDENTIALS.has(route.credential as string) &&
    (route.issues === undefined || ISSUES.has(route.issues as string)) &&
    (route.clears === undefined ||
      (Array.isArray(route.clears) &&
        route.clears.every((held) => HELD.has(held)))) &&
    (route.body === undefined ||
      (typeof route.body === "object" &&
        route.body !== null &&
        Array.isArray((route.body as { pick?: unknown }).pick))) &&
    (route.delivery === undefined || route.delivery === true)
  );
}

/**
 * Accepts a manifest only if every route is one this package knows how to follow.
 *
 * A route with a credential or effect this version does not understand could not
 * be handled safely, so a manifest carrying one is refused whole and the bundled
 * copy is used instead, rather than proxying that route with the wrong token.
 */
export function parseAdapterManifest(
  value: unknown,
): AdapterManifest | undefined {
  if (!value || typeof value !== "object") return undefined;

  const manifest = value as Record<string, unknown>;

  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.routes)) {
    return undefined;
  }

  if (!manifest.routes.every(isRoute)) {
    return undefined;
  }

  return value as AdapterManifest;
}

export interface ManifestRouteMatch {
  route: AdapterManifestRoute;
  params: Record<string, string>;
}

function segments(path: string) {
  return path.split("/").filter(Boolean);
}

/**
 * Finds the manifest route for a request.
 *
 * Static segments compare case-insensitively, matching Express's default and the
 * adapters' existing `/webAuthn` routes against the API's `/webauthn`. A static
 * match beats a parameter at the same position, so `/admin/users/import` is never
 * read as `/admin/users/{userId}`.
 */
export function matchManifestRoute(
  manifest: AdapterManifest,
  method: string,
  path: string,
): ManifestRouteMatch | undefined {
  const requested = segments(path);
  const upperMethod = method.toUpperCase();
  let best: { match: ManifestRouteMatch; score: number } | undefined;

  for (const route of manifest.routes) {
    if (route.method !== upperMethod) continue;

    const pattern = segments(route.path);
    if (pattern.length !== requested.length) continue;

    const params: Record<string, string> = {};
    let score = 0;
    let matched = true;

    for (let i = 0; i < pattern.length; i++) {
      const part = pattern[i];
      const param = /^\{(.+)\}$/.exec(part);

      if (param) {
        let value: string;

        try {
          value = decodeURIComponent(requested[i]);
        } catch {
          matched = false;
          break;
        }

        // Re-encoded, a dot segment survives as a literal `..` that fetch then
        // resolves, sending the held token to a different upstream path.
        if (value === "." || value === "..") {
          matched = false;
          break;
        }

        params[param[1]] = value;
        continue;
      }

      if (part.toLowerCase() !== requested[i].toLowerCase()) {
        matched = false;
        break;
      }

      score += 1;
    }

    if (matched && (!best || score > best.score)) {
      best = { match: { route, params }, score };
    }
  }

  return best?.match;
}

/** Fills a manifest path's `{param}` segments, encoding each value. */
export function buildManifestPath(
  route: AdapterManifestRoute,
  params: Record<string, string>,
): string {
  return route.path.replace(/\{([^}]+)\}/g, (_, name: string) =>
    encodeURIComponent(params[name] ?? ""),
  );
}

export interface AdapterManifestSourceOptions {
  authServerUrl: string;
  /**
   * `false` uses the bundled manifest only, for deployments that pin adapter
   * behaviour to the installed package version.
   */
  fetchManifest?: boolean;
  /** How long to wait before fetching again after a failure. */
  retryAfterMs?: number;
  /** How long the fetch may take before the bundled copy is used. */
  timeoutMs?: number;
}

export interface AdapterManifestSource {
  get(): Promise<AdapterManifest>;
}

const DEFAULT_RETRY_AFTER_MS = 60_000;
const DEFAULT_TIMEOUT_MS = 5_000;

/**
 * Loads the manifest from the auth API once, falling back to the bundled copy.
 *
 * A failed fetch is retried after `retryAfterMs` rather than on every request, so
 * an API that predates the manifest costs one request a minute, not one per call.
 * A fetched manifest is kept for the life of the process.
 */
export function createAdapterManifestSource(
  opts: AdapterManifestSourceOptions,
): AdapterManifestSource {
  if (opts.fetchManifest === false) {
    return { get: async () => BUNDLED_ADAPTER_MANIFEST };
  }

  const retryAfterMs = opts.retryAfterMs ?? DEFAULT_RETRY_AFTER_MS;
  let loaded: AdapterManifest | undefined;
  let pending: Promise<AdapterManifest> | undefined;
  let retryAt = 0;

  async function load(): Promise<AdapterManifest> {
    try {
      const response = await fetch(`${opts.authServerUrl}${ADAPTER_MANIFEST_PATH}`, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      });

      const manifest = response.ok
        ? parseAdapterManifest(await response.json())
        : undefined;

      if (manifest) {
        loaded = manifest;
        return manifest;
      }

      getSeamlessLogger().warn(
        `[SeamlessAuth] The auth API returned no usable adapter manifest (HTTP ${response.status}). Using the bundled copy.`,
      );
    } catch (error) {
      getSeamlessLogger().warn(
        `[SeamlessAuth] Could not fetch the adapter manifest (${(error as Error).message}). Using the bundled copy.`,
      );
    }

    retryAt = Date.now() + retryAfterMs;
    return BUNDLED_ADAPTER_MANIFEST;
  }

  return {
    async get() {
      if (loaded) return loaded;
      if (Date.now() < retryAt) return BUNDLED_ADAPTER_MANIFEST;

      pending ??= load().finally(() => {
        pending = undefined;
      });

      return pending;
    },
  };
}
