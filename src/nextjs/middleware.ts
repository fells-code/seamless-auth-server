import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "../tokens";

export function seamlessAuthMiddleware(options: {
  jwksUrl: string;
  excludedRoutes?: string[]; // Optionally allow public routes
}) {
  return async (req: NextRequest) => {
    const { pathname } = req.nextUrl;

    // Allow excluded routes (like /api/auth/refresh)
    if (options.excludedRoutes?.some((route) => pathname.startsWith(route))) {
      return NextResponse.next();
    }

    const token = req.cookies.get("seamless_access_token")?.value;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await verifyToken(token, options.jwksUrl);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // User is valid, proceed to API route
    return NextResponse.next();
  };
}
