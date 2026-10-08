import { fastifyCookie } from "@fastify/cookie";
import type { FastifyRequest } from "fastify";

/**
 * The request's cookies, whether or not a cookie plugin parsed them.
 *
 * The plugin registers `@fastify/cookie` inside its own encapsulated scope, so a
 * route the application registers elsewhere has no `request.cookies`. The guard
 * and `getSeamlessUser` are meant for exactly those routes, so they read the
 * `Cookie` header themselves when nothing parsed it.
 */
export function requestCookies(
  req: FastifyRequest,
): Record<string, string | undefined> {
  if (req.cookies) {
    return req.cookies;
  }

  const header = req.headers.cookie;

  return header ? fastifyCookie.parse(header) : {};
}
