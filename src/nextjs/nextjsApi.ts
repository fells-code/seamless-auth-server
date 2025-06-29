// src/nextjsApi.ts

import { otpHandlers } from "./routes/otp";
import { webAuthnHandlers } from "./routes/webauthn";
import { registrationHandler } from "./routes/registration";
import { loginHandler } from "./routes/login";
import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "./nextjs";

export async function authApiHandler(req: NextRequest) {
  const { pathname } = new URL(req.url);

  // Built-in User and Logout routes
  if (req.method === "GET" && pathname.endsWith("/api/auth/user")) {
    const user = await getUserFromRequest(req);
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ user });
  }

  if (req.method === "POST" && pathname.endsWith("/api/auth/logout")) {
    const res = NextResponse.json({ message: "Logged out" });
    res.cookies.set("seamless_access_token", "", { maxAge: 0, path: "/" });
    res.cookies.set("seamless_refresh_token", "", { maxAge: 0, path: "/" });
    return res;
  }

  // Route OTP requests
  if (pathname.includes("/api/auth/otp")) {
    return otpHandlers(req);
  }

  // Route WebAuthn requests
  if (pathname.includes("/api/auth/webauthn")) {
    return webAuthnHandlers(req);
  }

  // Registration
  if (
    req.method === "POST" &&
    pathname.endsWith("/api/auth/registration/register")
  ) {
    return registrationHandler(req);
  }

  // Login
  if (req.method === "POST" && pathname.endsWith("/api/auth/login")) {
    return loginHandler(req);
  }

  return NextResponse.json({ error: "Not Found" }, { status: 404 });
}
