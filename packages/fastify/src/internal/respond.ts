import type { FastifyReply } from "fastify";
import {
  applyResult,
  type AppliableResult,
  type CookieSecurityOptions,
  type ResponseAdapter,
} from "@seamless-auth/core";

/**
 * Fastify half of core's response contract: emit a cookie, clear a cookie, send
 * a body. What to emit is decided in core.
 *
 * `clearCookie` mirrors the set-path attributes on purpose. A clearing header
 * without `Secure; SameSite=None` is dropped by the browser in a cross-site
 * response, leaving the session cookie in place.
 */
export function fastifyResponseAdapter(reply: FastifyReply): ResponseAdapter {
  return {
    setCookie(command) {
      reply.setCookie(command.name, command.value, {
        httpOnly: command.httpOnly,
        secure: command.secure,
        sameSite: command.sameSite,
        path: command.path,
        domain: command.domain || undefined,
        maxAge: command.maxAgeSeconds,
        expires: command.expires,
      });
    },

    // Written with setCookie rather than clearCookie: @fastify/cookie's clear
    // path also emits `Max-Age=0`, and the header has to match what every other
    // adapter sends for the same instruction.
    clearCookie(command) {
      reply.setCookie(command.name, "", {
        secure: command.secure,
        sameSite: command.sameSite,
        domain: command.domain || undefined,
        path: command.path,
        expires: command.expires,
      });
    },

    send(status, body) {
      if (body === undefined) {
        reply.status(status).send();
        return;
      }

      reply.status(status).send(body);
    },
  };
}

export function respond(
  reply: FastifyReply,
  result: AppliableResult,
  opts: CookieSecurityOptions,
): void {
  applyResult(result, fastifyResponseAdapter(reply), opts);
}
