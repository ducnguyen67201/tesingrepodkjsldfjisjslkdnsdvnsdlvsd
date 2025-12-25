"use client";

import { useState, useCallback, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  FileCode,
  Plus,
  Search,
  Upload,
  Download,
  X,
  Tag,
  Rocket,
  FlaskConical,
  Clock,
  BarChart3,
  Layers,
  FolderKanban,
  ChevronDown,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc/client";
import { useWorkspaceUrl } from "@/hooks/use-workspace-url";
import { usePrompts, usePromptDetail } from "@/hooks/use-prompts";
import { showSuccess } from "@/lib/success";
import { showError } from "@/lib/errors";
import { PromptCard } from "@/components/prompts/prompt-card";
import { CreatePromptDialog } from "@/components/prompts/create-prompt-dialog";
import { CreateVersionDialog } from "@/components/prompts/create-version-dialog";
import { VersionCard } from "@/components/prompts/version-card";
import { ImportPromptsDialog } from "@/components/prompts/import-prompts-dialog";
import { PromptPlayground } from "@/components/prompts/prompt-playground";
import { PromptAnalytics } from "@/components/prompts/prompt-analytics";
import { EditPromptDialog } from "@/components/prompts/edit-prompt-dialog";
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

  // Fetch editing prompt details
  const { data: editingPromptData, isLoading: isLoadingEditingPrompt } = trpc.prompts.get.useQuery(
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
      // Type assertion to match the expected schema type
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
    return (
      <div className="flex h-full">
        <div className="flex-1 flex flex-col border-r p-4 space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-full" />
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        </div>
        <div className="w-[480px] p-4 space-y-4">
          <Skeleton className="h-6 w-32" />
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center max-w-md">
          <div className="rounded-full bg-muted/50 p-5 mx-auto w-fit">
            <FolderKanban className="h-10 w-10 text-muted-foreground/70" />
          </div>
          <h2 className="mt-6 text-lg font-semibold">No projects yet</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Create a project first to start managing prompts.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Left: Prompts List */}
      <div className="flex-1 flex flex-col border-r">
        {/* Row 1: Header - aligns with right panel header */}
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

        {/* Row 2: Search - aligns with right panel tabs */}
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

        {/* Row 3: Filters - aligns with right panel description (h-[36px]) */}
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
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="rounded-full bg-muted/50 p-5">
                  <FileCode className="h-10 w-10 text-muted-foreground/70" />
                </div>
                <h3 className="mt-6 text-base font-semibold">No prompts yet</h3>
                <p className="mt-2 text-sm text-muted-foreground max-w-[260px] leading-relaxed">
                  Create prompts to store and version your templates. Fetch them
                  at runtime via SDK.
                </p>
                <Button
                  className="mt-4"
                  onClick={() => setIsCreateOpen(true)}
                  disabled={!effectiveProjectId}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Create First Prompt
                </Button>
              </div>
            ) : filteredPrompts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <h3 className="text-base font-semibold">No matching prompts</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Try adjusting your search or filters
                </p>
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={handleClearFilters}
                >
                  Clear Filters
                </Button>
              </div>
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
          <div className="flex flex-col h-full">
            {/* Row 1: Empty header - matches left panel */}
            <div className="flex items-center h-[72px] px-4 border-b bg-background">
              <span className="text-muted-foreground text-sm">No prompt selected</span>
            </div>
            {/* Row 2: Empty tabs placeholder - matches left panel */}
            <div className="h-[52px] px-4 border-b bg-background" />
            {/* Row 3: Empty filters placeholder - matches left panel */}
            <div className="h-[36px] border-b bg-muted/30" />
            {/* Content: Empty state */}
            <div className="flex-1 flex items-center justify-center text-center p-8">
              <div>
                <FileCode className="h-12 w-12 text-muted-foreground/30 mx-auto" />
                <p className="mt-4 text-sm text-muted-foreground">
                  Select a prompt to view versions and details
                </p>
              </div>
            </div>
          </div>
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

/**
 * Prompt detail panel showing versions and analytics
 */
function PromptDetailPanel({
  workspaceSlug,
  promptId,
  promptName,
}: {
  workspaceSlug: string;
  promptId: string;
  promptName: string;
}) {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [playgroundVersionId, setPlaygroundVersionId] = useState<string | null>(
    null
  );

  const {
    prompt,
    isLoading,
    createVersion,
    setLabel,
    removeLabel,
    isCreatingVersion,
    isSettingLabel,
    isRemovingLabel,
  } = usePromptDetail({ workspaceSlug, promptId });

  const handleOpenPlayground = useCallback((versionId: string) => {
    setPlaygroundVersionId(versionId);
  }, []);

  const handleClosePlayground = useCallback(() => {
    setPlaygroundVersionId(null);
  }, []);

  const playgroundVersion = prompt?.versions.find(
    (v) => v.id === playgroundVersionId
  );

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-6 w-32" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
    );
  }

  if (!prompt) {
    return (
      <div className="flex-1 flex items-center justify-center text-center p-8">
        <div>
          <FileCode className="h-12 w-12 text-muted-foreground/30 mx-auto" />
          <p className="mt-4 text-sm text-muted-foreground">Prompt not found</p>
        </div>
      </div>
    );
  }

  const latestVersion = prompt.versions[0];

  return (
    <div className="flex flex-col h-full">
      {/* Row 1: Header - aligns with left panel header (h-[72px]) */}
      <div className="flex items-center justify-between h-[72px] px-4 border-b bg-background">
        <div>
          <h2 className="text-lg font-semibold">{promptName}</h2>
          <code className="text-xs text-muted-foreground mt-1 block">{prompt.slug}</code>
        </div>
        <Button size="sm" onClick={() => setIsCreateOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          New Version
        </Button>
      </div>

      {/* Row 2: Tabs - aligns with left panel search (h-[52px]) */}
      <Tabs defaultValue="versions" className="flex-1 flex flex-col">
        <div className="flex items-center h-[52px] px-4 border-b bg-background">
          <TabsList className="h-9">
            <TabsTrigger value="versions" className="h-8 gap-1.5 text-xs px-3">
              <Layers className="h-3.5 w-3.5" />
              Versions ({prompt.versions.length})
            </TabsTrigger>
            <TabsTrigger value="analytics" className="h-8 gap-1.5 text-xs px-3">
              <BarChart3 className="h-3.5 w-3.5" />
              Analytics
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Row 3: Description/metadata - aligns with left panel filters */}
        <div className="flex items-center h-[36px] px-4 border-b bg-muted/30">
          {prompt.description ? (
            <p className="text-xs text-muted-foreground truncate">
              {prompt.description}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground/50">
              No description
            </p>
          )}
        </div>

        <TabsContent value="versions" className="flex-1 mt-0 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-4 space-y-3">
              {prompt.versions.map((version) => (
                <VersionCard
                  key={version.id}
                  id={version.id}
                  version={version.version}
                  type={version.type}
                  content={version.content}
                  labels={version.labels}
                  createdAt={version.createdAt}
                  onSetLabel={setLabel}
                  onRemoveLabel={removeLabel}
                  isSettingLabel={isSettingLabel}
                  isRemovingLabel={isRemovingLabel}
                  onPlayground={handleOpenPlayground}
                />
              ))}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="analytics" className="flex-1 mt-0 overflow-auto p-4">
          <PromptAnalytics workspaceSlug={workspaceSlug} promptId={promptId} />
        </TabsContent>
      </Tabs>

      {/* Create version dialog */}
      {latestVersion && (
        <CreateVersionDialog
          open={isCreateOpen}
          onOpenChange={setIsCreateOpen}
          promptName={prompt.name}
          currentVersion={latestVersion.version}
          currentType={latestVersion.type}
          currentContent={latestVersion.content}
          onCreateVersion={createVersion}
          isCreating={isCreatingVersion}
        />
      )}

      {/* Playground dialog */}
      <Dialog
        open={!!playgroundVersionId}
        onOpenChange={(open) => !open && handleClosePlayground()}
      >
        <DialogContent className="max-w-4xl h-[80vh]">
          <DialogHeader>
            <DialogTitle>Prompt Playground</DialogTitle>
          </DialogHeader>
          {playgroundVersion && (
            <PromptPlayground
              workspaceSlug={workspaceSlug}
              promptId={promptId}
              versionId={playgroundVersion.id}
              promptName={prompt.name}
              version={playgroundVersion.version}
              type={playgroundVersion.type}
              content={playgroundVersion.content}
              config={playgroundVersion.config}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
