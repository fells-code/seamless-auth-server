import { NextRequest, NextResponse } from "next/server";

export async function loginHandler(req: NextRequest) {
  if (req.method === "POST") {
    // TODO: Proxy to auth server
    return NextResponse.json({ message: "User logged in" });
  }

  return NextResponse.json({ error: "Not Found" }, { status: 404 });
}
