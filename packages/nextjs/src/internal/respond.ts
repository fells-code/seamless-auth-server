import { serialize } from "cookie";
import {
  applyResult,
  type AppliableResult,
  type CookieSecurityOptions,
  type ResponseAdapter,
} from "@seamless-auth/core";

import type { AuthContext } from "./context";

// Statuses that cannot carry a body. Express and Fastify drop one silently; the
// `Response` constructor throws instead, which turned the auth API's 204 from
// /webAuthn/register/finish into a 500 here.
const NULL_BODY_STATUSES = new Set([101, 204, 205, 304]);

/**
 * Collects what core decides to emit, then renders it as a `Response`. A route
 * handler returns its response rather than writing to one, so cookies written by
 * `ensureCookies` before the route runs have to be held until the end.
 *
 * `clearCookie` mirrors the set-path attributes on purpose. A clearing header
 * without `Secure; SameSite=None` is dropped by the browser in a cross-site
 * response, leaving the session cookie in place.
 */
export class ResponseCollector {
  private readonly setCookies: string[] = [];
  private status = 200;
  private body: unknown;

  readonly adapter: ResponseAdapter = {
    setCookie: (command) => {
      this.setCookies.push(
        serialize(command.name, command.value, {
          maxAge: command.maxAgeSeconds,
          domain: command.domain || undefined,
          path: command.path,
          expires: command.expires,
          httpOnly: command.httpOnly,
          secure: command.secure,
          sameSite: command.sameSite,
        }),
      );
    },

    clearCookie: (command) => {
      this.setCookies.push(
        serialize(command.name, "", {
          domain: command.domain || undefined,
          path: command.path,
          expires: command.expires,
          secure: command.secure,
          sameSite: command.sameSite,
        }),
      );
    },

    send: (status, body) => {
      this.status = status;
      this.body = body;
    },
  };

  json(status: number, body: unknown): Response {
    this.adapter.send(status, body);
    return this.toResponse();
  }

  toResponse(): Response {
    const headers = new Headers({ "cache-control": "no-store" });

    for (const cookie of this.setCookies) {
      headers.append("set-cookie", cookie);
    }

    if (this.body === undefined || NULL_BODY_STATUSES.has(this.status)) {
      return new Response(null, { status: this.status, headers });
    }

    headers.set("content-type", "application/json; charset=utf-8");
    return new Response(JSON.stringify(this.body), {
      status: this.status,
      headers,
    });
  }
}

export function respond(
  collector: ResponseCollector,
  ctx: AuthContext,
  result: AppliableResult,
  opts: CookieSecurityOptions,
): Response {
  applyResult(result, collector.adapter, { ...opts, transport: ctx.transport });
  return collector.toResponse();
}
