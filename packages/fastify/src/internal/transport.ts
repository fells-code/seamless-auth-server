import type { FastifyRequest } from "fastify";
import {
  AUTH_TRANSPORT_HEADER,
  resolveAuthTransport,
  type AuthTransport,
} from "@seamless-auth/core";

export function transportOf(req: FastifyRequest | undefined): AuthTransport {
  return resolveAuthTransport(req?.headers?.[AUTH_TRANSPORT_HEADER]);
}
