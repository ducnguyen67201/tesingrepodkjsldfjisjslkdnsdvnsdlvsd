import { redirect, notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { prisma } from "@ducsigr/db";
import { authOptions } from "@/lib/auth/config";
import { ThemeStudioClient } from "./theme-studio-client";

interface AppearancePageProps {
  params: Promise<{ workspaceSlug: string }>;
}

export default async function AppearancePage({ params }: AppearancePageProps) {
  const resolvedParams = await params;
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/login");
  }

  // Get workspace
  const membership = await prisma.workspaceMember.findFirst({
    where: {
      userId: session.user.id,
      workspace: { slug: resolvedParams.workspaceSlug },
    },
    include: {
      workspace: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
    },
  });

  if (!membership) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Appearance</h1>
        <p className="text-muted-foreground">
          Customize the visual appearance of your workspace.
        </p>
      </div>

      <ThemeStudioClient workspaceId={membership.workspace.id} />
    </div>
  );
}
