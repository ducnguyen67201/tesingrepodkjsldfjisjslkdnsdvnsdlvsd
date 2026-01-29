"use client";

import { useState, useCallback } from "react";
import { FolderKanban } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiKeyList } from "@/components/api-keys";
import { trpc } from "@/lib/trpc/client";
import { useWorkspaceUrl } from "@/hooks/use-workspace-url";

export default function WorkspaceSettingsApiKeysPage() {
  const { workspaceSlug } = useWorkspaceUrl();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null
  );

  const { data: projects, isLoading: isLoadingProjects } =
    trpc.projects.list.useQuery(
      { workspaceSlug: workspaceSlug ?? "" },
      { enabled: !!workspaceSlug }
    );

  // Auto-select first project if none selected
  const effectiveProjectId =
    selectedProjectId ?? (projects && projects.length > 0 ? projects[0]?.id ?? null : null);

  const handleProjectChange = useCallback((value: string) => {
    setSelectedProjectId(value);
  }, []);

  const renderProjectOption = (project: { id: string; name: string }) => (
    <SelectItem key={project.id} value={project.id}>
      {project.name}
    </SelectItem>
  );

  if (isLoadingProjects) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">API Keys</h1>
          <p className="text-sm text-muted-foreground">
            Manage API keys for your projects.
          </p>
        </div>
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!projects || projects.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">API Keys</h1>
          <p className="text-sm text-muted-foreground">
            Manage API keys for your projects.
          </p>
        </div>
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
          <FolderKanban className="h-12 w-12 text-muted-foreground/50" />
          <h3 className="mt-4 text-lg font-semibold">No projects yet</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Create a project first to manage API keys.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">API Keys</h1>
        <p className="text-sm text-muted-foreground">
          Manage API keys for your projects.
        </p>
      </div>

      {/* Project Selector */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium">Project:</span>
        <Select
          value={effectiveProjectId ?? undefined}
          onValueChange={handleProjectChange}
        >
          <SelectTrigger className="w-64">
            <SelectValue placeholder="Select a project" />
          </SelectTrigger>
          <SelectContent>
            {projects.map(renderProjectOption)}
          </SelectContent>
        </Select>
      </div>

      {/* API Keys List */}
      {workspaceSlug && effectiveProjectId && (
        <ApiKeyList workspaceSlug={workspaceSlug} projectId={effectiveProjectId} />
      )}
    </div>
  );
}
