import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "./nextjs";

export function withAuth(
  handler: (req: NextRequest, user: any) => Promise<Response>
) {
  return async function authWrapper(req: NextRequest) {
    const user = await getUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return handler(req, user);
  };
}
