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
import { SeamlessAuthServerOptions } from "../createServer";

function handle(res: Response, result: any) {
  if (result.error) {
    return res.status(result.status).json({ error: result.error });
  }
  return res.status(result.status).json(result.body);
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
    } as any),
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
    } as any),
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
    } as any),
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
    } as any),
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
    } as any),
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
    } as any),
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
    } as any),
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
    } as any),
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
    } as any),
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
    } as any),
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
    } as any),
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
    } as any),
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
    } as any),
  );
