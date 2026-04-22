import { authFetch } from "../authFetch.js";

export interface RequestOtpInput {
  authorization?: string;
  kind: "email" | "phone";
}

export interface RequestOtpOptions {
  authServerUrl: string;
  externalDelivery?: boolean;
}

export interface RequestOtpResult {
  status: number;
  body?: unknown;
  error?: unknown;
}

export async function requestOtpHandler(
  input: RequestOtpInput,
  opts: RequestOtpOptions,
): Promise<RequestOtpResult> {
  const path =
    input.kind === "email"
      ? "otp/generate-email-otp"
      : "otp/generate-phone-otp";

  const up = await authFetch(`${opts.authServerUrl}/${path}`, {
    method: "GET",
    authorization: input.authorization,
    ...(opts.externalDelivery
      ? {
          headers: {
            "x-seamless-auth-delivery-mode": "external",
          },
        }
      : {}),
  });

  const data = await up.json();

  if (!up.ok) {
    return {
      status: up.status,
      error: data,
    };
  }

  return {
    status: up.status,
    body: data,
  };
}
