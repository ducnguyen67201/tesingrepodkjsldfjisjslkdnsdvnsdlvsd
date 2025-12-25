"use client";

import { useState, useCallback, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  FlaskConical,
  Plus,
  Search,
  X,
  Tag,
  FolderKanban,
  ChevronDown,
  Play,
  Pause,
  CheckCircle,
  Archive,
  BarChart3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { trpc } from "@/lib/trpc/client";
import { useWorkspaceUrl } from "@/hooks/use-workspace-url";
import {
  usePromptExperiments,
  useExperimentDetail,
} from "@/hooks/use-prompt-experiments";
import { ExperimentCard } from "@/components/experiments/experiment-card";
import type { ExperimentStatus } from "@cognobserve/api/schemas";

// ============================================================
// Status Filter Configuration
// ============================================================

interface StatusFilter {
  value: ExperimentStatus | "all";
  label: string;
  icon: typeof Play;
}

const STATUS_FILTERS: StatusFilter[] = [
  { value: "running", label: "Running", icon: Play },
  { value: "paused", label: "Paused", icon: Pause },
  { value: "completed", label: "Completed", icon: CheckCircle },
  { value: "draft", label: "Draft", icon: FlaskConical },
  { value: "archived", label: "Archived", icon: Archive },
];

// ============================================================
// Main Page Component
// ============================================================

export default function WorkspaceExperimentsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { workspaceSlug } = useWorkspaceUrl();

  // Get selected project and experiment from URL
  const selectedProjectId = searchParams.get("projectId");
  const selectedExperimentId = searchParams.get("experimentId");

  // State
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<ExperimentStatus[]>(
    []
  );

  // Fetch projects for selector
  const { data: projects = [], isLoading: isLoadingProjects } =
    trpc.projects.list.useQuery(
      { workspaceSlug: workspaceSlug ?? "" },
      { enabled: !!workspaceSlug }
    );

  // Auto-select first project if none selected
  const effectiveProjectId = selectedProjectId ?? projects[0]?.id;
  const selectedProject = projects.find((p) => p.id === effectiveProjectId);

  // Fetch experiments for selected project
  const {
    experiments,
    isLoading: isLoadingExperiments,
    deleteExperiment,
    startExperiment,
    pauseExperiment,
    stopExperiment,
    archiveExperiment,
    isDeleting,
    isStarting,
    isPausing,
    isStopping,
    isArchiving,
  } = usePromptExperiments({
    workspaceSlug: workspaceSlug ?? "",
    projectId: effectiveProjectId ?? "",
  });

  // URL management
  const updateUrl = useCallback(
    (params: { projectId?: string | null; experimentId?: string | null }) => {
      const url = new URL(window.location.href);
      if (params.projectId !== undefined) {
        if (params.projectId) {
          url.searchParams.set("projectId", params.projectId);
        } else {
          url.searchParams.delete("projectId");
        }
      }
      if (params.experimentId !== undefined) {
        if (params.experimentId) {
          url.searchParams.set("experimentId", params.experimentId);
        } else {
          url.searchParams.delete("experimentId");
        }
      }
      router.push(url.pathname + url.search);
    },
    [router]
  );

  const handleSelectProject = useCallback(
    (projectId: string) => {
      updateUrl({ projectId, experimentId: null });
    },
    [updateUrl]
  );

  const handleViewDetails = useCallback(
    (experimentId: string) => {
      updateUrl({ experimentId });
    },
    [updateUrl]
  );

  const handleEdit = useCallback((experimentId: string) => {
    console.log("Edit experiment:", experimentId);
  }, []);

  const handleDelete = useCallback(
    async (experimentId: string) => {
      await deleteExperiment(experimentId);
      if (selectedExperimentId === experimentId) {
        updateUrl({ experimentId: null });
      }
    },
    [deleteExperiment, selectedExperimentId, updateUrl]
  );

  const handleStart = useCallback(
    async (experimentId: string) => {
      await startExperiment(experimentId);
    },
    [startExperiment]
  );

  const handlePause = useCallback(
    async (experimentId: string) => {
      await pauseExperiment(experimentId);
    },
    [pauseExperiment]
  );

  const handleStop = useCallback(
    async (experimentId: string) => {
      await stopExperiment(experimentId);
    },
    [stopExperiment]
  );

  const handleArchive = useCallback(
    async (experimentId: string) => {
      await archiveExperiment(experimentId);
    },
    [archiveExperiment]
  );

  // Compute available tags
  const availableTags = useMemo(
    () => Array.from(new Set(experiments.flatMap((e) => e.tags))).sort(),
    [experiments]
  );

  // Filter experiments
  const filteredExperiments = useMemo(() => {
    return experiments.filter((experiment) => {
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesQuery =
          experiment.name.toLowerCase().includes(query) ||
          experiment.slug.toLowerCase().includes(query) ||
          experiment.description?.toLowerCase().includes(query) ||
          experiment.tags.some((t) => t.toLowerCase().includes(query));
        if (!matchesQuery) return false;
      }

      if (selectedStatuses.length > 0) {
        if (!selectedStatuses.includes(experiment.status)) return false;
      }

      if (selectedTags.length > 0) {
        const hasSelectedTag = selectedTags.some((tag) =>
          experiment.tags.includes(tag)
        );
        if (!hasSelectedTag) return false;
      }

      return true;
    });
  }, [experiments, searchQuery, selectedStatuses, selectedTags]);

  const handleToggleTag = useCallback((tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }, []);

  const handleToggleStatus = useCallback((status: ExperimentStatus) => {
    setSelectedStatuses((prev) =>
      prev.includes(status)
        ? prev.filter((s) => s !== status)
        : [...prev, status]
    );
  }, []);

  const handleClearFilters = useCallback(() => {
    setSearchQuery("");
    setSelectedTags([]);
    setSelectedStatuses([]);
  }, []);

  const hasActiveFilters =
    searchQuery.length > 0 ||
    selectedTags.length > 0 ||
    selectedStatuses.length > 0;

  const selectedExperiment = experiments.find(
    (e) => e.id === selectedExperimentId
  );

  const isLoading =
    isLoadingProjects || (effectiveProjectId && isLoadingExperiments);

  if (isLoading) {
    return <ExperimentsPageSkeleton />;
  }

  if (projects.length === 0) {
    return <NoProjectsEmptyState />;
  }

  return (
    <div className="flex h-full">
      {/* Left: Experiments List */}
      <div className="flex-1 flex flex-col border-r">
        {/* Row 1: Header */}
        <div className="flex items-center justify-between h-[72px] px-4 border-b">
          <div>
            <h1 className="text-lg font-semibold">Experiments</h1>
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
                {experiments.length} experiments
              </span>
            </div>
          </div>
          <Button size="sm" disabled title="Coming soon">
            <Plus className="mr-1.5 h-4 w-4" />
            New Experiment
          </Button>
        </div>

        {/* Row 2: Search */}
        <div className="flex items-center h-[52px] px-4 border-b">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search experiments..."
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
          {STATUS_FILTERS.map((filter) => {
            const isSelected = selectedStatuses.includes(
              filter.value as ExperimentStatus
            );
            const Icon = filter.icon;
            return (
              <Badge
                key={filter.value}
                variant={isSelected ? "default" : "outline"}
                className={`cursor-pointer text-[10px] px-2 py-0.5 gap-1 ${
                  isSelected ? "" : "hover:bg-muted"
                }`}
                onClick={() =>
                  handleToggleStatus(filter.value as ExperimentStatus)
                }
              >
                <Icon className="h-2.5 w-2.5" />
                {filter.label}
              </Badge>
            );
          })}

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

        {/* Experiments List */}
        <ScrollArea className="flex-1">
          <div className="p-4">
            {experiments.length === 0 ? (
              <NoExperimentsEmptyState />
            ) : filteredExperiments.length === 0 ? (
              <NoResultsEmptyState onClearFilters={handleClearFilters} />
            ) : (
              <div className="space-y-3">
                {filteredExperiments.map((experiment) => (
                  <ExperimentCard
                    key={experiment.id}
                    id={experiment.id}
                    name={experiment.name}
                    slug={experiment.slug}
                    description={experiment.description}
                    status={experiment.status}
                    allocationPct={experiment.allocationPct}
                    tags={experiment.tags}
                    variants={experiment.variants.map((v) => ({
                      id: v.id,
                      name: v.name,
                      weight: v.weight,
                      isControl: v.isControl,
                      promptName: v.promptName,
                      promptSlug: v.promptSlug,
                      version: v.version,
                    }))}
                    startedAt={experiment.startedAt}
                    endedAt={experiment.endedAt}
                    createdAt={experiment.createdAt}
                    updatedAt={experiment.updatedAt}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onStart={handleStart}
                    onPause={handlePause}
                    onStop={handleStop}
                    onArchive={handleArchive}
                    onViewDetails={handleViewDetails}
                    isDeleting={isDeleting}
                    isStarting={isStarting}
                    isPausing={isPausing}
                    isStopping={isStopping}
                    isArchiving={isArchiving}
                    isSelected={experiment.id === selectedExperimentId}
                  />
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Right: Detail Panel */}
      <div className="w-[480px] flex flex-col bg-muted/30">
        {selectedExperimentId && selectedExperiment ? (
          <ExperimentDetailPanel
            workspaceSlug={workspaceSlug ?? ""}
            experimentId={selectedExperimentId}
          />
        ) : (
          <NoSelectionEmptyState />
        )}
      </div>
    </div>
  );
}

// ============================================================
// Detail Panel Component
// ============================================================

function ExperimentDetailPanel({
  workspaceSlug,
  experimentId,
}: {
  workspaceSlug: string;
  experimentId: string;
}) {
  const { experiment, analytics, isLoading, isLoadingAnalytics } =
    useExperimentDetail({
      workspaceSlug,
      experimentId,
    });

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

  if (!experiment) {
    return (
      <div className="flex-1 flex items-center justify-center text-center p-8">
        <div>
          <FlaskConical className="h-12 w-12 text-muted-foreground/30 mx-auto" />
          <p className="mt-4 text-sm text-muted-foreground">
            Experiment not found
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Row 1: Header */}
      <div className="flex items-center justify-between h-[72px] px-4 border-b bg-background">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">{experiment.name}</h2>
            <Badge
              className={`text-[10px] px-1.5 py-0 ${getStatusColor(experiment.status)}`}
            >
              {getStatusLabel(experiment.status)}
            </Badge>
          </div>
          <code className="text-xs text-muted-foreground mt-1 block">
            {experiment.slug}
          </code>
        </div>
      </div>

      {/* Row 2: Variant Summary */}
      <div className="h-[52px] px-4 border-b bg-background flex items-center gap-4">
        {experiment.variants.map((v) => (
          <div key={v.id} className="flex items-center gap-2">
            <Badge
              variant={v.isControl ? "secondary" : "outline"}
              className="text-xs"
            >
              Variant {v.name}
              {v.isControl && " (Control)"}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {v.weight / 100}%
            </span>
          </div>
        ))}
      </div>

      {/* Row 3: Description */}
      <div className="flex items-center h-[36px] px-4 border-b bg-muted/30">
        {experiment.description ? (
          <p className="text-xs text-muted-foreground truncate">
            {experiment.description}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground/50">No description</p>
        )}
      </div>

      {/* Content: Analytics Placeholder */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Variant Details */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium flex items-center gap-2">
              <FlaskConical className="h-4 w-4" />
              Variants
            </h3>
            {experiment.variants.map((v) => (
              <div
                key={v.id}
                className="rounded-lg border bg-background p-3 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={v.isControl ? "secondary" : "outline"}
                      className="text-xs"
                    >
                      {v.name}
                    </Badge>
                    {v.isControl && (
                      <span className="text-[10px] text-muted-foreground">
                        Control
                      </span>
                    )}
                  </div>
                  <span className="text-sm font-medium">{v.weight / 100}%</span>
                </div>
                {v.promptVersion && (
                  <div className="text-xs text-muted-foreground">
                    <span className="font-medium">
                      {v.promptVersion.prompt?.name ?? "Unknown Prompt"}
                    </span>
                    <span className="mx-1">v{v.promptVersion.version}</span>
                    <code className="text-[10px]">
                      ({v.promptVersion.prompt?.slug ?? "unknown"})
                    </code>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Analytics Placeholder */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Analytics
            </h3>
            <div className="rounded-lg border bg-background p-6 text-center">
              {isLoadingAnalytics ? (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-24 mx-auto" />
                  <Skeleton className="h-20 w-full" />
                </div>
              ) : analytics && analytics.totalUsage > 0 ? (
                <div className="space-y-4">
                  <p className="text-2xl font-bold">{analytics.totalUsage}</p>
                  <p className="text-xs text-muted-foreground">Total requests</p>
                  <div className="grid grid-cols-2 gap-4 mt-4">
                    {analytics.byVariant.map((v) => (
                      <div key={v.variantId} className="text-left">
                        <div className="flex items-center gap-1 mb-1">
                          <Badge variant="outline" className="text-[10px]">
                            {v.variantName}
                          </Badge>
                        </div>
                        <p className="text-sm font-medium">{v.usageCount}</p>
                        <p className="text-[10px] text-muted-foreground">
                          requests
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div>
                  <BarChart3 className="h-8 w-8 text-muted-foreground/30 mx-auto" />
                  <p className="mt-3 text-sm text-muted-foreground">
                    No data yet
                  </p>
                  <p className="text-xs text-muted-foreground/70 mt-1">
                    Analytics will appear once the experiment receives traffic
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

// ============================================================
// Helper Functions
// ============================================================

function getStatusColor(status: ExperimentStatus): string {
  const colors: Record<ExperimentStatus, string> = {
    draft: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
    running:
      "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    paused:
      "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    completed:
      "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    archived: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
  };
  return colors[status] ?? colors.draft;
}

function getStatusLabel(status: ExperimentStatus): string {
  const labels: Record<ExperimentStatus, string> = {
    draft: "Draft",
    running: "Running",
    paused: "Paused",
    completed: "Completed",
    archived: "Archived",
  };
  return labels[status] ?? status;
}

// ============================================================
// Empty States
// ============================================================

function NoProjectsEmptyState() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center max-w-md">
        <div className="rounded-full bg-muted/50 p-5 mx-auto w-fit">
          <FolderKanban className="h-10 w-10 text-muted-foreground/70" />
        </div>
        <h2 className="mt-6 text-lg font-semibold">No projects yet</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Create a project first to start running experiments.
        </p>
      </div>
    </div>
  );
}

function NoExperimentsEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="rounded-full bg-muted/50 p-5">
        <FlaskConical className="h-10 w-10 text-muted-foreground/70" />
      </div>
      <h3 className="mt-6 text-base font-semibold">No experiments yet</h3>
      <p className="mt-2 text-sm text-muted-foreground max-w-[260px] leading-relaxed">
        Create A/B experiments to test different prompt versions and measure
        performance.
      </p>
      <Button className="mt-4" disabled title="Coming soon">
        <Plus className="mr-2 h-4 w-4" />
        Create First Experiment
      </Button>
    </div>
  );
}

function NoResultsEmptyState({
  onClearFilters,
}: {
  onClearFilters: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <h3 className="text-base font-semibold">No matching experiments</h3>
      <p className="mt-2 text-sm text-muted-foreground">
        Try adjusting your search or filters
      </p>
      <Button variant="outline" className="mt-4" onClick={onClearFilters}>
        Clear Filters
      </Button>
    </div>
  );
}

function NoSelectionEmptyState() {
  return (
    <div className="flex flex-col h-full">
      {/* Row 1: Empty header - matches left panel */}
      <div className="flex items-center h-[72px] px-4 border-b bg-background">
        <span className="text-muted-foreground text-sm">
          No experiment selected
        </span>
      </div>
      {/* Row 2: Empty tabs placeholder - matches left panel */}
      <div className="h-[52px] px-4 border-b bg-background" />
      {/* Row 3: Empty filters placeholder - matches left panel */}
      <div className="h-[36px] border-b bg-muted/30" />
      {/* Content: Empty state */}
      <div className="flex-1 flex items-center justify-center text-center p-8">
        <div>
          <FlaskConical className="h-12 w-12 text-muted-foreground/30 mx-auto" />
          <p className="mt-4 text-sm text-muted-foreground">
            Select an experiment to view details and analytics
          </p>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Loading Skeleton
// ============================================================

function ExperimentsPageSkeleton() {
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
