// src/routes/otp.ts

import { NextRequest, NextResponse } from "next/server";

export async function otpHandlers(req: NextRequest) {
  const { pathname } = new URL(req.url);

  if (
    req.method === "POST" &&
    pathname.endsWith("/api/auth/otp/generate-phone-otp")
  ) {
    const authServerUrl =
      process.env.AUTH_SERVER_URL + "/otp/generate-phone-otp";

    const proxyRes = await fetch(authServerUrl, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    });

    const data = await proxyRes.json();

    return NextResponse.json(data, { status: proxyRes.status });
  }

  if (
    req.method === "POST" &&
    pathname.endsWith("/api/auth/otp/generate-email-otp")
  ) {
    return NextResponse.json({ message: "Email OTP generated" });
  }

  if (
    req.method === "POST" &&
    pathname.endsWith("/api/auth/otp/verify-phone-otp")
  ) {
    const authServerUrl = process.env.AUTH_SERVER_URL + "/otp/verify-phone-otp";

    const proxyRes = await fetch(authServerUrl, {
      method: "POST",
      body: await req.text(),
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    });

    const data = await proxyRes.json();

    return NextResponse.json(data, { status: proxyRes.status });
  }

  if (
    req.method === "POST" &&
    pathname.endsWith("/api/auth/otp/verify-email-otp")
  ) {
    return NextResponse.json({ message: "Email OTP verified" });
  }

  return NextResponse.json({ error: "Not Found" }, { status: 404 });
}
