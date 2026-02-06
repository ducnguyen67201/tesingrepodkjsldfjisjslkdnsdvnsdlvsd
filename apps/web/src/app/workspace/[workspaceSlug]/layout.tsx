import { redirect, notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { prisma } from "@ducsigr/db";
import { authOptions } from "@/lib/auth/config";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { WorkspaceHeader } from "@/components/layout/workspace-header";
import { ThemeWrapper } from "@/components/theme/theme-wrapper";
import {
  WorkspaceThemeConfigSchema,
  type WorkspaceThemeConfig,
} from "@ducsigr/api/schemas";

interface WorkspaceLayoutProps {
  children: React.ReactNode;
  params: Promise<{ workspaceSlug: string }>;
}

/**
 * Fetch the active theme config for a workspace.
 * Returns null if no theme extension is installed or enabled.
 */
async function getActiveTheme(
  workspaceId: string
): Promise<{ config: WorkspaceThemeConfig; isActive: boolean } | null> {
  const activeInstall = await prisma.extensionInstall.findFirst({
    where: {
      workspaceId,
      enabled: true,
      extension: { type: "THEME" },
    },
    select: {
      configJson: true,
    },
  });

  if (!activeInstall) {
    return null;
  }

  // Parse and validate the config
  const parsed = WorkspaceThemeConfigSchema.safeParse(activeInstall.configJson);
  if (!parsed.success) {
    console.warn("Invalid theme config in database:", parsed.error);
    return null;
  }

  return {
    config: parsed.data,
    isActive: true,
  };
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

  // Check if user is a system admin
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isSystemAdmin: true },
  });
  const isAdmin = user?.isSystemAdmin ?? false;

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

  // System admins can access any workspace, even without membership
  if (!membership && !isAdmin) {
    notFound();
  }

  let workspace;
  if (membership) {
    workspace = {
      ...membership.workspace,
      role: membership.role,
    };
  } else {
    // System admin without membership — fetch workspace directly
    const ws = await prisma.workspace.findUnique({
      where: { slug: resolvedParams.workspaceSlug },
      select: { id: true, name: true, slug: true, isPersonal: true },
    });
    if (!ws) {
      notFound();
    }
    workspace = { ...ws, role: "ADMIN" as const };
  }

  // Fetch active theme for this workspace
  const activeTheme = await getActiveTheme(workspace.id);

  return (
    <ThemeWrapper
      workspaceId={workspace.id}
      initialConfig={activeTheme?.config ?? null}
      initialIsActive={activeTheme?.isActive ?? false}
    >
      <SidebarProvider defaultOpen={false}>
        <AppSidebar workspace={workspace} />
        <SidebarInset>
          <WorkspaceHeader workspaceName={workspace.name} />
          <main className="flex-1 overflow-auto p-4">{children}</main>
        </SidebarInset>
      </SidebarProvider>
    </ThemeWrapper>
  );
}
