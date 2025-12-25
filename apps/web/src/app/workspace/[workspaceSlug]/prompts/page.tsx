"use client";

import { useState, useCallback, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Plus,
  Search,
  Upload,
  Download,
  X,
  Tag,
  Rocket,
  FlaskConical,
  Clock,
  FolderKanban,
  ChevronDown,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { trpc } from "@/lib/trpc/client";
import { useWorkspaceUrl } from "@/hooks/use-workspace-url";
import { usePrompts } from "@/hooks/use-prompts";
import { showSuccess } from "@/lib/success";
import { showError } from "@/lib/errors";
import {
  PromptCard,
  CreatePromptDialog,
  ImportPromptsDialog,
  EditPromptDialog,
  PromptDetailPanel,
  NoProjectsEmptyState,
  NoPromptsEmptyState,
  NoResultsEmptyState,
  NoSelectionEmptyState,
  PromptsPageSkeleton,
} from "@/components/prompts";
import { CreateExperimentDialog } from "@/components/experiments/create-experiment-dialog";

export default function WorkspacePromptsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { workspaceSlug } = useWorkspaceUrl();

  // Get selected project and prompt from URL
  const selectedProjectId = searchParams.get("projectId");
  const selectedPromptId = searchParams.get("promptId");

  // State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isExperimentOpen, setIsExperimentOpen] = useState(false);
  const [editingPromptId, setEditingPromptId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [showArchived, setShowArchived] = useState(false);

  // Fetch projects for selector
  const { data: projects = [], isLoading: isLoadingProjects } =
    trpc.projects.list.useQuery(
      { workspaceSlug: workspaceSlug ?? "" },
      { enabled: !!workspaceSlug }
    );

  // Auto-select first project if none selected
  const effectiveProjectId = selectedProjectId ?? projects[0]?.id;
  const selectedProject = projects.find((p) => p.id === effectiveProjectId);

  // Fetch prompts for selected project
  const {
    prompts,
    isLoading: isLoadingPrompts,
    updatePrompt,
    archivePrompt,
    deletePrompt,
    isUpdating,
    isDeleting,
    isArchiving,
  } = usePrompts({
    workspaceSlug: workspaceSlug ?? "",
    projectId: effectiveProjectId ?? "",
    includeArchived: showArchived,
  });

  // tRPC utils for cache invalidation
  const utils = trpc.useUtils();

  // Fetch editing prompt details (isLoading not needed - dialog handles loading state)
  const { data: editingPromptData } = trpc.prompts.get.useQuery(
    { workspaceSlug: workspaceSlug ?? "", promptId: editingPromptId ?? "" },
    { enabled: !!workspaceSlug && !!editingPromptId && isEditOpen }
  );

  // Create version mutation for editing
  const createVersionMutation = trpc.prompts.createVersion.useMutation({
    onSuccess: (newVersion) => {
      showSuccess("Version created", `Version ${newVersion.version} has been created.`);
      utils.prompts.list.invalidate({ workspaceSlug: workspaceSlug ?? "", projectId: effectiveProjectId ?? "" });
      utils.prompts.get.invalidate({ workspaceSlug: workspaceSlug ?? "", promptId: editingPromptId ?? "" });
    },
    onError: showError,
  });

  // Export functionality
  const exportQuery = trpc.prompts.export.useQuery(
    {
      workspaceSlug: workspaceSlug ?? "",
      projectId: effectiveProjectId ?? "",
      includeAllVersions: true,
    },
    { enabled: false }
  );

  // URL management
  const updateUrl = useCallback(
    (params: { projectId?: string | null; promptId?: string | null }) => {
      const url = new URL(window.location.href);
      if (params.projectId !== undefined) {
        if (params.projectId) {
          url.searchParams.set("projectId", params.projectId);
        } else {
          url.searchParams.delete("projectId");
        }
      }
      if (params.promptId !== undefined) {
        if (params.promptId) {
          url.searchParams.set("promptId", params.promptId);
        } else {
          url.searchParams.delete("promptId");
        }
      }
      router.push(url.pathname + url.search);
    },
    [router]
  );

  const handleSelectProject = useCallback(
    (projectId: string) => {
      updateUrl({ projectId, promptId: null });
    },
    [updateUrl]
  );

  const handleViewVersions = useCallback(
    (promptId: string) => {
      updateUrl({ promptId });
    },
    [updateUrl]
  );

  const handleEdit = useCallback((promptId: string) => {
    setEditingPromptId(promptId);
    setIsEditOpen(true);
  }, []);

  const handleToggleArchived = useCallback(() => {
    setShowArchived((prev) => !prev);
  }, []);

  const handleCreateVersionForEdit = useCallback(
    async (data: { template: { type: "text"; text: string } | { type: "chat"; messages: Array<{ role: string; content: string; name?: string }> } }) => {
      if (!editingPromptId || !workspaceSlug) return;
      const template = data.template.type === "text"
        ? data.template
        : {
            type: "chat" as const,
            messages: data.template.messages.map((m) => ({
              role: m.role as "system" | "user" | "assistant" | "tool",
              content: m.content,
              name: m.name,
            })),
          };
      await createVersionMutation.mutateAsync({
        workspaceSlug,
        promptId: editingPromptId,
        template,
      });
    },
    [editingPromptId, workspaceSlug, createVersionMutation]
  );

  const handleCloseEditDialog = useCallback((open: boolean) => {
    setIsEditOpen(open);
    if (!open) {
      setEditingPromptId(null);
    }
  }, []);

  // Prepare editing prompt data with version content
  const editingPrompt = useMemo(() => {
    if (!editingPromptData) return null;
    const latestVersion = editingPromptData.versions[0];
    return {
      id: editingPromptData.id,
      name: editingPromptData.name,
      slug: editingPromptData.slug,
      description: editingPromptData.description,
      tags: editingPromptData.tags,
      latestVersionType: latestVersion?.type as "text" | "chat" | undefined,
      latestVersionContent: latestVersion?.content as { type: "text"; text: string } | { type: "chat"; messages: Array<{ role: string; content: string }> } | undefined,
    };
  }, [editingPromptData]);

  const handleDelete = useCallback(
    async (promptId: string) => {
      await deletePrompt(promptId);
      if (selectedPromptId === promptId) {
        updateUrl({ promptId: null });
      }
    },
    [deletePrompt, selectedPromptId, updateUrl]
  );

  const handleArchive = useCallback(
    async (promptId: string, archive: boolean) => {
      await archivePrompt(promptId, archive);
    },
    [archivePrompt]
  );

  const handleExport = useCallback(async () => {
    const result = await exportQuery.refetch();
    if (result.data) {
      const blob = new Blob([JSON.stringify(result.data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `prompts-export-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showSuccess("Export complete", "Prompts downloaded successfully.");
    }
  }, [exportQuery]);

  // Compute available tags
  const availableTags = useMemo(
    () => Array.from(new Set(prompts.flatMap((p) => p.tags))).sort(),
    [prompts]
  );

  const availableLabels = ["production", "staging", "latest"] as const;

  // Filter prompts
  const filteredPrompts = useMemo(() => {
    return prompts.filter((prompt) => {
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesQuery =
          prompt.name.toLowerCase().includes(query) ||
          prompt.slug.toLowerCase().includes(query) ||
          prompt.description?.toLowerCase().includes(query) ||
          prompt.tags.some((t) => t.toLowerCase().includes(query));
        if (!matchesQuery) return false;
      }

      if (selectedTags.length > 0) {
        const hasSelectedTag = selectedTags.some((tag) =>
          prompt.tags.includes(tag)
        );
        if (!hasSelectedTag) return false;
      }

      if (selectedLabels.length > 0) {
        const hasSelectedLabel = selectedLabels.some((label) =>
          prompt.labels.includes(label as "production" | "staging" | "latest")
        );
        if (!hasSelectedLabel) return false;
      }

      return true;
    });
  }, [prompts, searchQuery, selectedTags, selectedLabels]);

  const handleToggleTag = useCallback((tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }, []);

  const handleToggleLabel = useCallback((label: string) => {
    setSelectedLabels((prev) =>
      prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]
    );
  }, []);

  const handleClearFilters = useCallback(() => {
    setSearchQuery("");
    setSelectedTags([]);
    setSelectedLabels([]);
  }, []);

  const hasActiveFilters =
    searchQuery.length > 0 ||
    selectedTags.length > 0 ||
    selectedLabels.length > 0;

  const selectedPrompt = prompts.find((p) => p.id === selectedPromptId);

  const isLoading = isLoadingProjects || (effectiveProjectId && isLoadingPrompts);

  if (isLoading) {
    return <PromptsPageSkeleton />;
  }

  if (projects.length === 0) {
    return <NoProjectsEmptyState />;
  }

  return (
    <div className="flex h-full">
      {/* Left: Prompts List */}
      <div className="flex-1 flex flex-col border-r">
        {/* Row 1: Header */}
        <div className="flex items-center justify-between h-[72px] px-4 border-b">
          <div>
            <h1 className="text-lg font-semibold">Prompts</h1>
            <div className="flex items-center gap-2 mt-1">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs text-muted-foreground gap-1"
                  >
                    <FolderKanban className="h-3 w-3" />
                    {selectedProject?.name ?? "Select project"}
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {projects.map((project) => (
                    <DropdownMenuItem
                      key={project.id}
                      onClick={() => handleSelectProject(project.id)}
                      className={
                        project.id === effectiveProjectId ? "bg-muted" : ""
                      }
                    >
                      <FolderKanban className="mr-2 h-4 w-4" />
                      {project.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <span className="text-xs text-muted-foreground">
                {prompts.length} prompts
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsImportOpen(true)}
              className="h-8 px-2"
            >
              <Upload className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleExport}
              disabled={prompts.length === 0}
              className="h-8 px-2"
            >
              <Download className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsExperimentOpen(true)}
              disabled={!effectiveProjectId || prompts.length < 2}
              title={prompts.length < 2 ? "Need at least 2 prompts to create an A/B test" : ""}
            >
              <FlaskConical className="mr-1.5 h-4 w-4" />
              A/B Test
            </Button>
            <Button
              variant="ghost"
              size="sm"
              asChild
              className="text-muted-foreground"
            >
              <Link href={`/workspace/${workspaceSlug}/experiments${effectiveProjectId ? `?projectId=${effectiveProjectId}` : ""}`}>
                <ExternalLink className="mr-1.5 h-4 w-4" />
                View Experiments
              </Link>
            </Button>
            <Button
              size="sm"
              onClick={() => setIsCreateOpen(true)}
              disabled={!effectiveProjectId}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              New Prompt
            </Button>
          </div>
        </div>

        {/* Row 2: Search */}
        <div className="flex items-center h-[52px] px-4 border-b">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search prompts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9"
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                onClick={() => setSearchQuery("")}
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>

        {/* Row 3: Filters */}
        <div className="flex items-center gap-1.5 h-[36px] px-4 border-b bg-muted/30">
          {availableLabels.map((label) => {
            const isSelected = selectedLabels.includes(label);
            const Icon =
              label === "production"
                ? Rocket
                : label === "staging"
                ? FlaskConical
                : Clock;
            return (
              <Badge
                key={label}
                variant={isSelected ? "default" : "outline"}
                className={`cursor-pointer text-[10px] px-2 py-0.5 gap-1 ${
                  isSelected ? "" : "hover:bg-muted"
                }`}
                onClick={() => handleToggleLabel(label)}
              >
                <Icon className="h-2.5 w-2.5" />
                {label}
              </Badge>
            );
          })}

          <div className="w-px h-4 bg-border mx-1" />

          <Badge
            variant={showArchived ? "default" : "outline"}
            className={`cursor-pointer text-[10px] px-2 py-0.5 ${
              showArchived ? "" : "hover:bg-muted"
            }`}
            onClick={handleToggleArchived}
          >
            {showArchived ? "Showing archived" : "Show archived"}
          </Badge>

          {availableTags.length > 0 && (
            <div className="w-px h-4 bg-border mx-1" />
          )}

          {availableTags.slice(0, 5).map((tag) => {
            const isSelected = selectedTags.includes(tag);
            return (
              <Badge
                key={tag}
                variant={isSelected ? "secondary" : "outline"}
                className={`cursor-pointer text-[10px] px-2 py-0.5 gap-1 ${
                  isSelected ? "" : "hover:bg-muted"
                }`}
                onClick={() => handleToggleTag(tag)}
              >
                <Tag className="h-2.5 w-2.5" />
                {tag}
              </Badge>
            );
          })}

          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="h-5 px-2 text-[10px] text-muted-foreground ml-auto"
              onClick={handleClearFilters}
            >
              <X className="h-2.5 w-2.5 mr-1" />
              Clear
            </Button>
          )}
        </div>

        {/* Prompts List */}
        <ScrollArea className="flex-1">
          <div className="p-4">
            {prompts.length === 0 ? (
              <NoPromptsEmptyState
                onCreateClick={() => setIsCreateOpen(true)}
                disabled={!effectiveProjectId}
              />
            ) : filteredPrompts.length === 0 ? (
              <NoResultsEmptyState onClearFilters={handleClearFilters} />
            ) : (
              <div className="space-y-3">
                {filteredPrompts.map((prompt) => (
                  <PromptCard
                    key={prompt.id}
                    {...prompt}
                    isSelected={prompt.id === selectedPromptId}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onArchive={handleArchive}
                    onViewVersions={handleViewVersions}
                    isDeleting={isDeleting}
                    isArchiving={isArchiving}
                  />
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Right: Detail Panel */}
      <div className="w-[480px] flex flex-col bg-muted/30">
        {selectedPromptId && selectedPrompt ? (
          <PromptDetailPanel
            workspaceSlug={workspaceSlug ?? ""}
            promptId={selectedPromptId}
            promptName={selectedPrompt.name}
          />
        ) : (
          <NoSelectionEmptyState />
        )}
      </div>

      {/* Dialogs */}
      {effectiveProjectId && (
        <>
          <CreatePromptDialog
            open={isCreateOpen}
            onOpenChange={setIsCreateOpen}
            workspaceSlug={workspaceSlug ?? ""}
            projectId={effectiveProjectId}
          />

          <ImportPromptsDialog
            open={isImportOpen}
            onOpenChange={setIsImportOpen}
            workspaceSlug={workspaceSlug ?? ""}
            projectId={effectiveProjectId}
          />

          <EditPromptDialog
            open={isEditOpen}
            onOpenChange={handleCloseEditDialog}
            prompt={editingPrompt}
            onUpdate={updatePrompt}
            onCreateVersion={handleCreateVersionForEdit}
            isUpdating={isUpdating}
            isCreatingVersion={createVersionMutation.isPending}
            workspaceSlug={workspaceSlug ?? ""}
          />

          <CreateExperimentDialog
            open={isExperimentOpen}
            onOpenChange={setIsExperimentOpen}
            workspaceSlug={workspaceSlug ?? ""}
            projectId={effectiveProjectId ?? ""}
          />
        </>
      )}
    </div>
  );
}
