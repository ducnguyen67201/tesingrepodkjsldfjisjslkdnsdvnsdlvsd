import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { prisma } from "@ducsigr/db";
import { authOptions } from "@/lib/auth/config";

/**
 * Root page redirects to the user's default workspace.
 * - If not authenticated, redirect to login
 * - If authenticated, redirect to personal workspace (or first workspace)
 */
export default async function RootPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/login");
  }

  // Find user's personal workspace (or first workspace)
  const membership = await prisma.workspaceMember.findFirst({
    where: { userId: session.user.id },
    include: {
      workspace: {
        select: { slug: true, isPersonal: true },
      },
    },
    orderBy: [
      { workspace: { isPersonal: "desc" } }, // Personal workspace first
      { createdAt: "asc" }, // Then by oldest membership
    ],
  });

  if (!membership) {
    // No workspace found - user needs to be added to a workspace by an admin
    redirect("/no-workspace");
  }

  // Redirect to the default workspace
  redirect(`/workspace/${membership.workspace.slug}`);
}
