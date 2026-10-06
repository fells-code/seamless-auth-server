import type { RouteHandler } from "./handler";

export type SeamlessConsoleProxyOptions = {
  authServerUrl: string;
  /** Subtree requested upstream. Defaults to `/console`. */
  basePath?: string;
  /**
   * Where the catch-all route is mounted, including any Next.js `basePath`.
   * Defaults to `/console`, which is the path the dashboard is built against.
   */
  mountPath?: string;
};

// Only the read methods: Next.js answers 405 for a method the route does not
// export, so a write never reaches the upstream.
export interface SeamlessConsoleProxyHandlers {
  GET: RouteHandler;
  HEAD: RouteHandler;
}

const FORWARDED_RESPONSE_HEADERS = [
  "content-type",
  "cache-control",
  "etag",
  "last-modified",
];

const NULL_BODY_STATUSES = new Set([101, 204, 205, 304]);

const UPSTREAM_TIMEOUT_MS = 10000;

function normalizeBasePath(basePath: string): string {
  const withLeadingSlash = basePath.startsWith("/") ? basePath : `/${basePath}`;
  return withLeadingSlash.replace(/\/+$/, "") || "/";
}

// The `Request` constructor has already parsed the URL, which collapses literal
// `..` and `%2e%2e` dot-segments. A traversal out of the mount therefore shows
// up here as a path that no longer starts with it, and is refused rather than
// guessed at.
function stripMountPath(rawPath: string, mountPath: string): string | null {
  if (mountPath === "/") {
    return rawPath;
  }

  if (rawPath === mountPath) {
    return "/";
  }

  return rawPath.startsWith(`${mountPath}/`)
    ? rawPath.slice(mountPath.length)
    : null;
}

// Resolve the upstream URL and refuse anything that escapes the console subtree.
// `new URL` does NOT decode `%2f`/`%5c`, so `..%2fadmin` stays a single opaque
// segment that passes the prefix check yet decodes to a traversal at an upstream
// that does decode it. Reject encoded path separators outright: legitimate
// console asset paths and SPA client routes never contain one, so this has no
// false positives and does not depend on how the upstream decodes.
function resolveUpstreamUrl(
  authServerUrl: string,
  basePath: string,
  subpath: string,
  search: string,
): URL | null {
  if (/%2f|%5c/i.test(subpath)) {
    return null;
  }

  let baseUrl: URL;
  try {
    baseUrl = new URL(authServerUrl);
  } catch {
    return null;
  }

  const prefix = `${baseUrl.pathname.replace(/\/+$/, "")}${basePath}`;
  const suffix = subpath === "/" ? "" : subpath;

  let resolved: URL;
  try {
    resolved = new URL(`${prefix}${suffix}${search}`, baseUrl.origin);
  } catch {
    return null;
  }

  if (
    resolved.pathname !== prefix &&
    !resolved.pathname.startsWith(`${prefix}/`)
  ) {
    return null;
  }

  return resolved;
}

function jsonError(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

/**
 * Serves the Seamless admin dashboard SPA from a Next.js App Router catch-all
 * route by reverse-proxying it from the auth server.
 *
 * Mount it at `/console`, the path the dashboard is built against, beside the
 * auth handler, so the dashboard loads from the same origin that exposes the
 * cookie-based `/auth/*` routes.
 *
 * Nothing from the incoming request is forwarded but the method and the path:
 * the console is public static hosting, and the browser's session cookies have
 * no business at the upstream.
 *
 * ### Example
 * ```ts
 * // app/console/[[...path]]/route.ts
 * import { createSeamlessConsoleProxy } from "@seamless-auth/nextjs";
 *
 * export const { GET, HEAD } = createSeamlessConsoleProxy({
 *   authServerUrl: process.env.AUTH_SERVER_URL!,
 * });
 * ```
 */
export function createSeamlessConsoleProxy(
  options: SeamlessConsoleProxyOptions,
): SeamlessConsoleProxyHandlers {
  const basePath = normalizeBasePath(options.basePath ?? "/console");
  const mountPath = normalizeBasePath(options.mountPath ?? "/console");

  async function handle(request: Request): Promise<Response> {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return jsonError(405, "Method not allowed");
    }

    const url = new URL(request.url);
    const subpath = stripMountPath(url.pathname, mountPath);
    const upstream =
      subpath === null
        ? null
        : resolveUpstreamUrl(
            options.authServerUrl,
            basePath,
            subpath,
            url.search,
          );

    if (!upstream) {
      return jsonError(400, "Invalid console path");
    }

    let response: Response;
    try {
      response = await fetch(upstream, {
        method: request.method,
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      });
    } catch {
      return jsonError(502, "Console upstream unreachable");
    }

    const headers = new Headers();
    for (const header of FORWARDED_RESPONSE_HEADERS) {
      const value = response.headers.get(header);
      if (value !== null) {
        headers.set(header, value);
      }
    }

    // A body is read in full rather than streamed through: the upstream fetch
    // is bound by a timeout, and a stream would outlive it.
    const body =
      request.method === "HEAD" ||
      !response.body ||
      NULL_BODY_STATUSES.has(response.status)
        ? null
        : await response.arrayBuffer();

    return new Response(body, { status: response.status, headers });
  }

  return { GET: handle, HEAD: handle };
}
