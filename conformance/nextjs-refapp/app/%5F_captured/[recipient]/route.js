import { captured } from "../../../lib/seamless.mjs";

// A test hook, never part of a real deployment. The folder name is URL-encoded
// because App Router treats a folder starting with an underscore as private.
export const dynamic = "force-dynamic";

export async function GET(_request, { params }) {
  const { recipient } = await params;
  return Response.json(captured.get(recipient) ?? null);
}
