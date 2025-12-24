"use client";

import { useParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { WORKSPACE_ADMIN_ROLES } from "@cognobserve/api/schemas";
import { trpc } from "@/lib/trpc/client";
import { ExtensionsHub } from "@/components/extensions";

export default function WorkspaceSettingsExtensionsPage() {
  const params = useParams<{ workspaceSlug: string }>();

  // Get workspace details
  const { data: workspace, isLoading: isLoadingWorkspace } =
    trpc.workspaces.getBySlug.useQuery(
      { workspaceSlug: params.workspaceSlug },
      { enabled: !!params.workspaceSlug }
    );

  const isAdmin = workspace
    ? (WORKSPACE_ADMIN_ROLES as readonly string[]).includes(workspace.role)
    : false;

  if (isLoadingWorkspace) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Extensions Hub</h1>
          <p className="text-sm text-muted-foreground">
            You don&apos;t have permission to manage extensions.
          </p>
        </div>
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Extensions Hub</h1>
          <p className="text-sm text-muted-foreground">Workspace not found.</p>
        </div>
      </div>
    );
  }

  return (
    <ExtensionsHub
      workspaceSlug={params.workspaceSlug}
      workspaceId={workspace.id}
    />
  );
}
