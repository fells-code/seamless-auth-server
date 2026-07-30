import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";

export type SeamlessConsoleProxyOptions = {
  authServerUrl: string;
  basePath?: string;
};

const FORWARDED_RESPONSE_HEADERS = [
  "content-type",
  "cache-control",
  "etag",
  "last-modified",
];

// The console is read-only static hosting, but the route has to claim the other
// methods too so they answer 405 rather than falling through to a 404 that says
// nothing about why.
const PROXIED_METHODS = [
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
] as const;

const UPSTREAM_TIMEOUT_MS = 10000;

function normalizeBasePath(basePath: string): string {
  const withLeadingSlash = basePath.startsWith("/") ? basePath : `/${basePath}`;
  return withLeadingSlash.replace(/\/+$/, "") || "/";
}

// Fastify percent-decodes wildcard params, which turns `%2e%2e` into `..` and
// `%2f` into `/` before any check here could see the difference. Everything
// below works off the raw `request.url` instead, so the decision is made on what
// the client actually sent.
function splitUrl(rawUrl: string): { path: string; search: string } {
  const queryIndex = rawUrl.indexOf("?");

  return queryIndex === -1
    ? { path: rawUrl, search: "" }
    : { path: rawUrl.slice(0, queryIndex), search: rawUrl.slice(queryIndex) };
}

function stripMountPath(rawPath: string, mountPath: string): string | null {
  if (mountPath === "/") {
    return rawPath;
  }

  // Routing matched this path under the mount, but router options that sanitize
  // the path before matching (`ignoreDuplicateSlashes`) leave `request.url`
  // looking different from what matched. Refuse rather than guess at the subpath.
  if (!rawPath.startsWith(mountPath)) {
    return null;
  }

  return rawPath.slice(mountPath.length) || "/";
}

// Resolve the upstream URL and refuse anything that escapes the console subtree.
// `new URL` collapses literal `..` and `%2e%2e` dot-segments, so those land
// outside the prefix and are rejected below. It does NOT decode `%2f`/`%5c`, so
// `..%2fadmin` stays a single opaque segment that passes the prefix check yet
// decodes to a traversal at an upstream that does decode it. Reject encoded path
// separators outright: legitimate console asset paths and SPA client routes never
// contain one, so this has no false positives and does not depend on how the
// upstream decodes.
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

/**
 * Fastify plugin that reverse-proxies the Seamless admin dashboard SPA.
 *
 * Register it under the same top-level `/console` prefix the dashboard is built
 * against, as a sibling of the auth plugin's prefix, so the dashboard loads from
 * the same origin that exposes the cookie-based `/auth/*` endpoints.
 *
 * Nothing from the incoming request is forwarded but the method and the path:
 * the console is public static hosting, and the browser's session cookies have
 * no business at the upstream.
 *
 * ### Example
 * ```ts
 * await app.register(seamlessAuth, { prefix: "/auth", ...opts });
 * await app.register(seamlessConsoleProxy, {
 *   prefix: "/console",
 *   authServerUrl: opts.authServerUrl,
 * });
 * ```
 *
 * @param options - Configuration for the console proxy:
 *   - `authServerUrl` - Base URL of the Seamless Auth API serving `/console` (required)
 *   - `basePath` - Subtree requested upstream (defaults to `/console`)
 */
export const seamlessConsoleProxy: FastifyPluginAsync<
  SeamlessConsoleProxyOptions
> = async (fastify, opts) => {
  const basePath = normalizeBasePath(opts.basePath ?? "/console");
  const mountPath = normalizeBasePath(fastify.prefix);

  const handler = async (
    req: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      reply.status(405).send({ error: "Method not allowed" });
      return;
    }

    const { path, search } = splitUrl(req.url);
    const subpath = stripMountPath(path, mountPath);
    const upstream =
      subpath === null
        ? null
        : resolveUpstreamUrl(opts.authServerUrl, basePath, subpath, search);

    if (!upstream) {
      reply.status(400).send({ error: "Invalid console path" });
      return;
    }

    let response: globalThis.Response;
    try {
      response = await fetch(upstream, {
        method: req.method,
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      });
    } catch {
      reply.status(502).send({ error: "Console upstream unreachable" });
      return;
    }

    for (const header of FORWARDED_RESPONSE_HEADERS) {
      const value = response.headers.get(header);
      if (value !== null) {
        reply.header(header, value);
      }
    }

    reply.status(response.status);

    if (req.method === "HEAD" || !response.body) {
      reply.send();
      return;
    }

    reply.send(Buffer.from(await response.arrayBuffer()));
  };

  for (const url of ["/", "/*"]) {
    fastify.route({
      method: [...PROXIED_METHODS],
      url,
      // HEAD is declared above; without this Fastify adds its own sibling HEAD
      // route for the GET and the two collide.
      exposeHeadRoute: false,
      handler,
    });
  }
};

export default seamlessConsoleProxy;
