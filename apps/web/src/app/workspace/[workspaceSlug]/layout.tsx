import { redirect, notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { prisma } from "@cognobserve/db";
import { authOptions } from "@/lib/auth/config";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { WorkspaceHeader } from "@/components/layout/workspace-header";

interface WorkspaceLayoutProps {
  children: React.ReactNode;
  params: Promise<{ workspaceSlug: string }>;
}

export default async function WorkspaceLayout({
  children,
  params,
}: WorkspaceLayoutProps) {
  const resolvedParams = await params;
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/login");
  }

  // Verify user has access to this workspace
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
          isPersonal: true,
        },
      },
    },
  });

  if (!membership) {
    notFound();
  }

  const workspace = {
    ...membership.workspace,
    role: membership.role,
  };

  return (
    <SidebarProvider defaultOpen={false}>
      <AppSidebar workspace={workspace} />
      <SidebarInset>
        <WorkspaceHeader workspaceName={workspace.name} />
        <main className="flex-1 overflow-auto p-4">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
