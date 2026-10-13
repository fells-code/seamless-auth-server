import { Request, Response } from "express";
import { finishRegisterHandler } from "@seamless-auth/core/handlers/finishRegister";
import { respond } from "../internal/respond.js";
import {
  buildProxyServiceAuthorization,
  buildServiceAuthorization,
} from "../internal/buildAuthorization.js";
import { buildForwardedClientIp } from "../internal/buildForwardedClientIp.js";
import { buildForwardedUserAgent } from "../internal/buildForwardedUserAgent.js";
import { SeamlessAuthServerOptions } from "../createServer.js";

export async function finishRegister(
  req: Request & { cookiePayload?: any },
  res: Response,
  opts: SeamlessAuthServerOptions,
) {
  const authorization = buildServiceAuthorization(req, opts);

  const result = await finishRegisterHandler(
    {
      body: req.body,
      authorization,
      serviceAuthorization: buildProxyServiceAuthorization(opts),
      forwardedClientIp: buildForwardedClientIp(req, opts.resolveClientIp),
      forwardedUserAgent: buildForwardedUserAgent(req),
    },
    { authServerUrl: opts.authServerUrl },
  );

  respond(res, { ...result, body: { message: "success" } }, opts);
}
