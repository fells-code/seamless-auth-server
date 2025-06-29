import { NextRequest, NextResponse } from "next/server";

export async function registrationHandler(req: NextRequest) {
  if (req.method === "POST") {
    // TODO: Proxy to auth server
    return NextResponse.json({ message: "User registered" });
  }

  return NextResponse.json({ error: "Not Found" }, { status: 404 });
}
