import { verifyToken } from "../tokens";

export async function getUserFromNodeRequest(req: any): Promise<any | null> {
  try {
    const token = req.cookies?.seamless_access_token;

    if (!token) return null;

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
