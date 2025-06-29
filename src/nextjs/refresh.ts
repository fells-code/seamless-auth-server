import { NextRequest, NextResponse } from "next/server";

export function createSeamlessRefreshHandler(options: {
  authServerUrl: string;
  cookieDomain: string;
}) {
  return async (req: NextRequest) => {
    const refreshToken = req.cookies.get("seamless_refresh_token")?.value;

    if (!refreshToken) {
      return NextResponse.json(
        { error: "Missing refresh token" },
        { status: 401 }
      );
    }

    // Forward refresh token to auth server
    const res = await fetch(`${options.authServerUrl}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });

    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json(
        { error: "Refresh failed" },
        { status: res.status }
      );
    }

    const response = NextResponse.json({ message: "Token refreshed" });

    // Set the new access token cookie
    response.cookies.set("seamless_access_token", data.newAccessToken, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      domain: options.cookieDomain,
      maxAge: 15 * 60 * 1000,
    });

    return response;
  };
}
