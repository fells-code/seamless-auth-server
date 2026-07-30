import { Request, Response } from "express";
import {
  getUsersHandler,
  createUserHandler,
  deleteUserHandler,
  updateUserHandler,
  getUserDetailHandler,
  getUserAnomaliesHandler,
  getAuthEventsHandler,
  getCredentialCountHandler,
  listAllSessionsHandler,
  listUserSessionsHandler,
  recoverUserForDeviceReplacementHandler,
  revokeAllUserSessionsHandler,
  revokeUserSessionHandler,
} from "@seamless-auth/core/handlers/admin";

import {
  buildProxyServiceAuthorization,
  buildServiceAuthorization,
} from "../internal/buildAuthorization";
import { buildForwardedClientIp } from "../internal/buildForwardedClientIp";
import { respond } from "../internal/respond";
import { SeamlessAuthServerOptions } from "../createServer";

function handle(res: Response, result: any, opts: SeamlessAuthServerOptions) {
  respond(res, result, opts);
}

export const getUsers = async (
  req: Request,
  res: Response,
  opts: SeamlessAuthServerOptions,
) =>
  handle(
    res,
    await getUsersHandler({
      authServerUrl: opts.authServerUrl,
      authorization: buildServiceAuthorization(req, opts),
      serviceAuthorization: buildProxyServiceAuthorization(opts),
      forwardedClientIp: buildForwardedClientIp(req, opts.resolveClientIp),
    }),
    opts,
  );

export const createUser = async (
  req: Request,
  res: Response,
  opts: SeamlessAuthServerOptions,
) =>
  handle(
    res,
    await createUserHandler({
      authServerUrl: opts.authServerUrl,
      authorization: buildServiceAuthorization(req, opts),
      serviceAuthorization: buildProxyServiceAuthorization(opts),
      forwardedClientIp: buildForwardedClientIp(req, opts.resolveClientIp),
      body: req.body,
    }),
    opts,
  );

export const deleteUser = async (
  req: Request,
  res: Response,
  opts: SeamlessAuthServerOptions,
) =>
  handle(
    res,
    await deleteUserHandler({
      authServerUrl: opts.authServerUrl,
      authorization: buildServiceAuthorization(req, opts),
      serviceAuthorization: buildProxyServiceAuthorization(opts),
      forwardedClientIp: buildForwardedClientIp(req, opts.resolveClientIp),
      body: req.body,
    }),
    opts,
  );

export const updateUser = async (
  req: Request,
  res: Response,
  opts: SeamlessAuthServerOptions,
) =>
  handle(
    res,
    await updateUserHandler(req.params.userId as string, {
      authServerUrl: opts.authServerUrl,
      authorization: buildServiceAuthorization(req, opts),
      serviceAuthorization: buildProxyServiceAuthorization(opts),
      forwardedClientIp: buildForwardedClientIp(req, opts.resolveClientIp),
      body: req.body,
    }),
    opts,
  );

export const getUserDetail = async (
  req: Request,
  res: Response,
  opts: SeamlessAuthServerOptions,
) =>
  handle(
    res,
    await getUserDetailHandler(req.params.userId as string, {
      authServerUrl: opts.authServerUrl,
      authorization: buildServiceAuthorization(req, opts),
      serviceAuthorization: buildProxyServiceAuthorization(opts),
      forwardedClientIp: buildForwardedClientIp(req, opts.resolveClientIp),
    }),
    opts,
  );

export const getUserAnomalies = async (
  req: Request,
  res: Response,
  opts: SeamlessAuthServerOptions,
) =>
  handle(
    res,
    await getUserAnomaliesHandler(req.params.userId as string, {
      authServerUrl: opts.authServerUrl,
      authorization: buildServiceAuthorization(req, opts),
      serviceAuthorization: buildProxyServiceAuthorization(opts),
      forwardedClientIp: buildForwardedClientIp(req, opts.resolveClientIp),
    }),
    opts,
  );

export const getAuthEvents = async (
  req: Request,
  res: Response,
  opts: SeamlessAuthServerOptions,
) =>
  handle(
    res,
    await getAuthEventsHandler({
      authServerUrl: opts.authServerUrl,
      authorization: buildServiceAuthorization(req, opts),
      serviceAuthorization: buildProxyServiceAuthorization(opts),
      forwardedClientIp: buildForwardedClientIp(req, opts.resolveClientIp),
      query: req.query,
    }),
    opts,
  );

export const getCredentialCount = async (
  req: Request,
  res: Response,
  opts: SeamlessAuthServerOptions,
) =>
  handle(
    res,
    await getCredentialCountHandler({
      authServerUrl: opts.authServerUrl,
      authorization: buildServiceAuthorization(req, opts),
      serviceAuthorization: buildProxyServiceAuthorization(opts),
      forwardedClientIp: buildForwardedClientIp(req, opts.resolveClientIp),
    }),
    opts,
  );

export const listAllSessions = async (
  req: Request,
  res: Response,
  opts: SeamlessAuthServerOptions,
) =>
  handle(
    res,
    await listAllSessionsHandler({
      authServerUrl: opts.authServerUrl,
      authorization: buildServiceAuthorization(req, opts),
      serviceAuthorization: buildProxyServiceAuthorization(opts),
      forwardedClientIp: buildForwardedClientIp(req, opts.resolveClientIp),
      query: req.query,
    }),
    opts,
  );

export const listUserSessions = async (
  req: Request,
  res: Response,
  opts: SeamlessAuthServerOptions,
) =>
  handle(
    res,
    await listUserSessionsHandler(req.params.userId as string, {
      authServerUrl: opts.authServerUrl,
      authorization: buildServiceAuthorization(req, opts),
      serviceAuthorization: buildProxyServiceAuthorization(opts),
      forwardedClientIp: buildForwardedClientIp(req, opts.resolveClientIp),
    }),
    opts,
  );

export const revokeUserSession = async (
  req: Request,
  res: Response,
  opts: SeamlessAuthServerOptions,
) =>
  handle(
    res,
    await revokeUserSessionHandler(req.params.id as string, {
      authServerUrl: opts.authServerUrl,
      authorization: buildServiceAuthorization(req, opts),
      serviceAuthorization: buildProxyServiceAuthorization(opts),
      forwardedClientIp: buildForwardedClientIp(req, opts.resolveClientIp),
    }),
    opts,
  );

export const revokeAllUserSessions = async (
  req: Request,
  res: Response,
  opts: SeamlessAuthServerOptions,
) =>
  handle(
    res,
    await revokeAllUserSessionsHandler(req.params.userId as string, {
      authServerUrl: opts.authServerUrl,
      authorization: buildServiceAuthorization(req, opts),
      serviceAuthorization: buildProxyServiceAuthorization(opts),
      forwardedClientIp: buildForwardedClientIp(req, opts.resolveClientIp),
    }),
    opts,
  );

export const recoverUserForDeviceReplacement = async (
  req: Request,
  res: Response,
  opts: SeamlessAuthServerOptions,
) =>
  handle(
    res,
    await recoverUserForDeviceReplacementHandler(req.params.userId as string, {
      authServerUrl: opts.authServerUrl,
      authorization: buildServiceAuthorization(req, opts),
      serviceAuthorization: buildProxyServiceAuthorization(opts),
      forwardedClientIp: buildForwardedClientIp(req, opts.resolveClientIp),
      body: req.body,
    }),
    opts,
  );
