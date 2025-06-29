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
    const authServerUrl =
      process.env.AUTH_SERVER_URL + "/webAuthn/verify-authentication";

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
