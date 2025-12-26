import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { SignJWT } from "jose";
import { prisma } from "@ducsigr/db";
import { authOptions } from "@/lib/auth/config";
import { apiError, apiServerError } from "@/lib/api-responses";
import {
  isGitHubAppConfigured,
  getStateSecret,
  getInstallationUrl,
} from "@/lib/github";

/**
 * State token payload for CSRF protection
 */
interface StatePayload {
  workspaceId: string;
  workspaceSlug: string;
  userId: string;
  nonce: string;
}

/**
 * GET /api/github/install
 *
 * Initiates GitHub App installation flow.
 * Verifies authentication and workspace admin access,
 * then redirects to GitHub App installation page.
 *
 * Query params:
 * - workspace: Workspace slug (required)
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const workspaceSlug = searchParams.get("workspace");

  // 1. Verify authentication
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError.unauthorized("Please sign in to connect GitHub");
  }

  // 2. Validate workspace parameter
  if (!workspaceSlug) {
    return apiError.badRequest("Missing workspace parameter");
  }

  // 3. Verify workspace access with OWNER/ADMIN role
  const workspace = await prisma.workspace.findFirst({
    where: {
      slug: workspaceSlug,
      members: {
        some: {
          userId: session.user.id,
          role: { in: ["OWNER", "ADMIN"] },
        },
      },
    },
    select: {
      id: true,
      slug: true,
    },
  });

  if (!workspace) {
    return apiError.forbidden(
      "Workspace not found or you don't have admin access"
    );
  }

  // 4. Check GitHub App is configured
  if (!isGitHubAppConfigured()) {
    return apiServerError.notConfigured("GitHub App");
  }

  // 5. Generate signed state token for CSRF protection
  const stateSecret = new TextEncoder().encode(getStateSecret());

  const statePayload: StatePayload = {
    workspaceId: workspace.id,
    workspaceSlug: workspace.slug,
    userId: session.user.id,
    nonce: crypto.randomUUID(),
  };

  const state = await new SignJWT(statePayload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m") // 10 minute expiry
    .sign(stateSecret);

  // 6. Redirect to GitHub App installation page
  const installUrl = getInstallationUrl(state);
  return NextResponse.redirect(installUrl);
}
