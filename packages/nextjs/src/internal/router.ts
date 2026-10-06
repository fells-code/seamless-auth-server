import type { AppliableResult } from "@seamless-auth/core";

import type { ResolvedOptions } from "../options";
import type { AuthContext } from "./context";

export type RouteMethod = "GET" | "POST" | "PATCH" | "DELETE";

export type RouteRun = (
  ctx: AuthContext,
  opts: ResolvedOptions,
) => Promise<AppliableResult>;

export interface Route {
  method: RouteMethod;
  /** Mount-relative, with `:params`. */
  path: string;
  run: RouteRun;
}

export interface RouteMatch {
  route: Route;
  params: Record<string, string>;
}

function segments(path: string): string[] {
  return path.split("/").filter(Boolean);
}

/**
 * First match in table order wins, as in Express. Static segments compare
 * case-insensitively because Express routes do, and the SDKs reach
 * `/webAuthn` through that; `ensureCookies` matches the same way. A trailing
 * slash is ignored, also as in Express.
 */
export function matchRoute(
  routes: Route[],
  method: string,
  path: string,
): RouteMatch | undefined {
  const actual = segments(path);

  for (const route of routes) {
    if (route.method !== method) continue;

    const expected = segments(route.path);
    if (expected.length !== actual.length) continue;

    const params: Record<string, string> = {};
    const matched = expected.every((segment, index) => {
      const value = actual[index];

      if (segment.startsWith(":")) {
        try {
          params[segment.slice(1)] = decodeURIComponent(value);
        } catch {
          return false;
        }
        return true;
      }

      return segment.toLowerCase() === value.toLowerCase();
    });

    if (matched) {
      return { route, params };
    }
  }

  return undefined;
}

export function param(ctx: AuthContext, name: string): string {
  const value = ctx.params[name];

  if (typeof value !== "string" || value === "") {
    throw new Error(`Missing route parameter "${name}"`);
  }

  return value;
}
