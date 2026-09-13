import type { Request } from "express";
import {
  AUTH_TRANSPORT_HEADER,
  resolveAuthTransport,
  type AuthTransport,
} from "@seamless-auth/core";

export function transportOf(req: Request | undefined): AuthTransport {
  return resolveAuthTransport(req?.headers?.[AUTH_TRANSPORT_HEADER]);
}
