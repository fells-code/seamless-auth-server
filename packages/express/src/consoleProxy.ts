import express, { Request, Response, Router } from "express";

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

function normalizeBasePath(basePath: string): string {
  const withLeadingSlash = basePath.startsWith("/") ? basePath : `/${basePath}`;
  return withLeadingSlash.replace(/\/+$/, "") || "/";
}

// Resolve the upstream URL and refuse anything that escapes the console subtree.
// `new URL` normalizes `..` segments, so a request like `/console/../admin/users`
// collapses to `/admin/users` and fails the prefix check instead of reaching the
// auth API's admin routes.
function resolveUpstreamUrl(
  authServerUrl: string,
  basePath: string,
  subpath: string,
  search: string,
): URL | null {
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
 * Creates an Express Router that reverse-proxies the Seamless admin dashboard SPA.
 *
 * Mount it at the same top-level `/console` path the dashboard is built against, as a
 * sibling of the adapter's `/auth` mount, so the dashboard loads from the same origin
 * that exposes this adapter's cookie-based `/auth/*` endpoints.
 *
 * ### Example
 * ```ts
 * app.use("/auth", createSeamlessAuthServer(opts));
 * app.use("/console", createSeamlessConsoleProxy({ authServerUrl: opts.authServerUrl }));
 * ```
 *
 * @param options - Configuration for the console proxy:
 *   - `authServerUrl` — Base URL of the Seamless Auth API serving `/console` (required)
 *   - `basePath` — Mounted subtree proxied upstream (defaults to `/console`)
 *
 * @returns An Express `Router` that proxies `GET`/`HEAD` console requests upstream.
 */
export function createSeamlessConsoleProxy(
  options: SeamlessConsoleProxyOptions,
): Router {
  const r = express.Router();
  const basePath = normalizeBasePath(options.basePath ?? "/console");

  r.use(async (req: Request, res: Response) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const search = req.url.includes("?")
      ? req.url.slice(req.url.indexOf("?"))
      : "";
    const upstream = resolveUpstreamUrl(
      options.authServerUrl,
      basePath,
      req.path,
      search,
    );

    if (!upstream) {
      res.status(400).json({ error: "Invalid console path" });
      return;
    }

    let response: globalThis.Response;
    try {
      response = await fetch(upstream, { method: req.method });
    } catch {
      res.status(502).json({ error: "Console upstream unreachable" });
      return;
    }

    for (const header of FORWARDED_RESPONSE_HEADERS) {
      const value = response.headers.get(header);
      if (value !== null) {
        res.setHeader(header, value);
      }
    }

    res.status(response.status);

    if (req.method === "HEAD" || !response.body) {
      res.end();
      return;
    }

    const body = Buffer.from(await response.arrayBuffer());
    res.end(body);
  });

  return r;
}
