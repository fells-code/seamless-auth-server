import { authFetch } from "../authFetch.js";

export interface VerifyMagicLinkInput {
  token: string;
}

export interface VerifyMagicLinkOptions {
  authServerUrl: string;
}

export interface VerifyMagicLinkResult {
  status: number;
  body?: unknown;
  error?: unknown;
}

export async function verifyMagicLinkHandler(
  input: VerifyMagicLinkInput,
  opts: VerifyMagicLinkOptions,
): Promise<VerifyMagicLinkResult> {
  const up = await authFetch(
    `${opts.authServerUrl}/magic-link/verify/${input.token}`,
    {
      method: "GET",
    },
  );

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
