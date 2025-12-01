import jwt from "jsonwebtoken";
import { CookieRequest } from "../middleware/ensureCookies";

export interface AuthFetchOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: any;
  cookies?: string[];
  headers?: Record<string, string>;
}

export async function authFetch(
  req: CookieRequest,
  url: string,
  { method = "POST", body, cookies, headers = {} }: AuthFetchOptions = {}
) {
  const serviceKey = process.env.SEAMLESS_SERVICE_TOKEN;

  if (!serviceKey) {
    throw new Error(
      "Cannot sign service token. Missing SEAMLESS_SERVICE_TOKEN"
    );
  }

  console.debug(
    "[SeamlessAuth] Performing authentication fetch to Auth server"
  );

  // -------------------------------
  // Issue short-lived machine token
  // -------------------------------
  const token = jwt.sign(
    {
      // Minimal, safe fields
      iss: process.env.FRONTEND_URL,
      aud: process.env.AUTH_SERVER_URL,
      sub: req.cookiePayload?.sub,
      roles: req.cookiePayload?.roles ?? [],
      iat: Math.floor(Date.now() / 1000),
    },
    serviceKey,
    {
      expiresIn: "60s", // Short-lived = safer
      algorithm: "HS256", // HMAC-based
      keyid: "dev-main", // For future rotation
    }
  );

  const finalHeaders: Record<string, string> = {
    ...(method !== "GET" && { "Content-Type": "application/json" }),
    ...(cookies ? { Cookie: cookies.join("; ") } : {}),
    Authorization: `Bearer ${serviceKey}`,
    ...headers,
  };

  let finalUrl = url;
  console.debug("[SeamlessAuth] URL ...", finalUrl);
  if (method === "GET" && body && typeof body === "object") {
    const qs = new URLSearchParams(body).toString();
    finalUrl += url.includes("?") ? `&${qs}` : `?${qs}`;
  }

  const res = await fetch(finalUrl, {
    method,
    headers: finalHeaders,
    ...(method !== "GET" && body ? { body: JSON.stringify(body) } : {}),
  });

  return res;
}
