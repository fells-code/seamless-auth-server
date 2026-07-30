import { Response } from "express";
import {
  applyResult,
  type AppliableResult,
  type CookieSecurityOptions,
  type ResponseAdapter,
} from "@seamless-auth/core";

/**
 * Express half of core's response contract: emit a cookie, clear a cookie, send
 * a body. Everything about what to emit is decided in core.
 *
 * `clearCookie` mirrors the set-path attributes on purpose. Express only forces
 * `expires`, and a clearing header without `Secure; SameSite=None` is dropped by
 * the browser in a cross-site response, leaving the session cookie in place.
 */
export function expressResponseAdapter(res: Response): ResponseAdapter {
  return {
    setCookie(command) {
      res.cookie(command.name, command.value, {
        httpOnly: command.httpOnly,
        secure: command.secure,
        sameSite: command.sameSite,
        path: command.path,
        domain: command.domain,
        maxAge: command.maxAgeSeconds * 1000,
      });
    },

    clearCookie(command) {
      res.clearCookie(command.name, {
        secure: command.secure,
        sameSite: command.sameSite,
        domain: command.domain,
        path: command.path,
      });
    },

    send(status, body) {
      if (body === undefined) {
        res.status(status).end();
        return;
      }

      res.status(status).json(body);
    },
  };
}

export function respond(
  res: Response,
  result: AppliableResult,
  opts: CookieSecurityOptions,
): void {
  applyResult(result, expressResponseAdapter(res), opts);
}
