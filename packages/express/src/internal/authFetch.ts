import fetch from "node-fetch";
import jwt, { JwtPayload } from "jsonwebtoken";
import { CookieRequest } from "../middleware/ensureCookies";

const privateKey = process.env.SERVICE_JWT_KEY

export interface AuthFetchOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: any;
  cookies?: string[];
  headers?: Record<string, string>;
}

export async function authFetch(req: CookieRequest, url: string, { method = "POST", body, cookies, headers = {} }: AuthFetchOptions = {}) {
  const token = privateKey
    ? jwt.sign({ aud: "auth-internal", iss: "portal-api", sub: req.cookiePayload?.sub, role: req.cookiePayload?.roles }, privateKey, {
        expiresIn: "60s",
        keyid: "service-main",
      })
    : undefined;

  if (!token) {
    throw new Error("Cannot sign JWT for communications with Seamless Auth Server. Did you set your SERVICE_JWT_KEY?")
  }

  const finalHeaders: Record<string, string> = {
    ...(method !== "GET" && { "Content-Type": "application/json" }),
    ...(cookies ? { Cookie: cookies.join("; ") } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...headers,
  };

 let finalUrl = url;
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
