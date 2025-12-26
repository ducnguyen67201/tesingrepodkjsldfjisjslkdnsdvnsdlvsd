import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { SignJWT } from "jose";
import { env } from "@/lib/env";

/**
 * Returns a bearer token for use with external services (Ingest, Worker, etc.)
 * This token is signed with the shared secret for cross-service validation.
 */
export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const secret = new TextEncoder().encode(env.JWT_SHARED_SECRET);

  const token = await new SignJWT({
    sub: session.user.id,
    email: session.user.email,
    projects: session.user.projects,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("15m")
    .setIssuer("ducsigr")
    .setAudience("ducsigr-api")
    .sign(secret);

  return NextResponse.json({
    token,
    expiresIn: 900, // 15 minutes in seconds
  });
}
