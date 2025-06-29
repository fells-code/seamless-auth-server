import { NextRequest, NextResponse } from "next/server";

export async function webAuthnHandlers(req: NextRequest) {
  const { pathname } = new URL(req.url);

  if (
    req.method === "POST" &&
    pathname.endsWith("/api/auth/webauthn/generate-authentication-options")
  ) {
    // TODO: Proxy to auth server
    return NextResponse.json({ message: "Generated authentication options" });
  }

  if (
    req.method === "POST" &&
    pathname.endsWith("/api/auth/webauthn/verify-authentication")
  ) {
    // TODO: Proxy to auth server
    return NextResponse.json({ message: "Authentication verified" });
  }

  if (
    req.method === "POST" &&
    pathname.endsWith("/api/auth/webauthn/generate-registration-options")
  ) {
    // TODO: Proxy to auth server
    return NextResponse.json({ message: "Generated registration options" });
  }

  if (
    req.method === "POST" &&
    pathname.endsWith("/api/auth/webauthn/verify-registration")
  ) {
    // TODO: Proxy to auth server
    return NextResponse.json({ message: "Registration verified" });
  }

  return NextResponse.json({ error: "Not Found" }, { status: 404 });
}
