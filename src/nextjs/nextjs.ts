import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "../tokens";

export function withSeamlessAuth(
  handler: Function,
  options: { jwksUrl: string }
) {
  return async (req: NextRequest) => {
    const token = req.cookies.get("seamless_access_token")?.value;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await verifyToken(token, options.jwksUrl);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return handler(req, { user });
  };
}

export async function getUserFromRequest(req: Request): Promise<any | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("seamless_access_token")?.value;

    if (!token) {
      return null;
    }

    const jwksUrl = process.env.SEAMLESS_AUTH_JWKS_URL;

    if (!jwksUrl) {
      throw new Error("JWKS URL not configured.");
    }

    const user = await verifyToken(token, jwksUrl);
    return user;
  } catch (err) {
    console.error("Token verification failed", err);
    return null;
  }
}
