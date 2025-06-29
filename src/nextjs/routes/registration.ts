import { NextRequest, NextResponse } from "next/server";

export async function registrationHandler(req: NextRequest) {
  if (req.method === "POST") {
    const authServerUrl =
      process.env.AUTH_SERVER_URL + "/registration/register";

    const proxyRes = await fetch(authServerUrl, {
      method: "POST",
      body: await req.text(),
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    });

    const data = await proxyRes.json();
    return NextResponse.json(data, { status: proxyRes.status });
  }

  return NextResponse.json({ error: "Not Found" }, { status: 404 });
}
