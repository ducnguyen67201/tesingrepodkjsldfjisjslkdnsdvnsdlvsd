"use client";

import { useState, useCallback, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Plus,
  Search,
  X,
  Tag,
  FolderKanban,
  ChevronDown,
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
import { usePromptExperiments } from "@/hooks/use-prompt-experiments";
import {
  ExperimentCard,
  ExperimentDetailPanel,
  NoProjectsEmptyState,
  NoExperimentsEmptyState,
  NoResultsEmptyState,
  NoSelectionEmptyState,
  ExperimentsPageSkeleton,
  STATUS_FILTERS,
} from "@/components/experiments";
import type { ExperimentStatus } from "@ducsigr/api/schemas";

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
                    analysisStatus={experiment.analysisStatus}
                    analysisError={experiment.analysisError}
                    winnerVariantId={experiment.winnerVariantId}
                    winnerConfidence={experiment.winnerConfidence}
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
