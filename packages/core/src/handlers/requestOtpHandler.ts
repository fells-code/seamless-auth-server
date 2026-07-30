import { authFetch } from "../authFetch.js";
import { EXTERNAL_DELIVERY_HEADERS } from "../apiContract.js";
import type { ResultFailure } from "../result.js";

export interface RequestOtpInput {
  authorization?: string;
  flow?: "registration" | "login";
  kind: "email" | "phone";
}

export interface RequestOtpOptions {
  authServerUrl: string;
  externalDelivery?: boolean;
  forwardedClientIp?: string;
  serviceAuthorization?: string;
}

export interface RequestOtpResult extends ResultFailure {
  status: number;
  body?: unknown;
}

export async function requestOtpHandler(
  input: RequestOtpInput,
  opts: RequestOtpOptions,
): Promise<RequestOtpResult> {
  const flow = input.flow ?? "registration";
  const path =
    flow === "login"
      ? input.kind === "email"
        ? "otp/generate-login-email-otp"
        : "otp/generate-login-phone-otp"
      : input.kind === "email"
        ? "otp/generate-email-otp"
        : "otp/generate-phone-otp";

  const up = await authFetch(`${opts.authServerUrl}/${path}`, {
    method: "GET",
    authorization: input.authorization,
    forwardedClientIp: opts.forwardedClientIp,
    serviceAuthorization: opts.serviceAuthorization,
    ...(opts.externalDelivery
      ? {
          headers: EXTERNAL_DELIVERY_HEADERS,
        }
      : {}),
  });

  const data = await up.json();

  if (!up.ok) {
    return {
      status: up.status,
      errorBody: data,
    };
  }

  return {
    status: up.status,
    body: data,
  };
}
