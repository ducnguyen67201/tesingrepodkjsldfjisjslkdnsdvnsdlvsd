"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plus, FolderKanban, Activity, ScrollText, ChevronDown, Clock, Layers } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc/client";
import { useWorkspaceUrl } from "@/hooks/use-workspace-url";
import { cn } from "@/lib/utils";
import type { ProjectListItem } from "@ducsigr/api/client";

export default function WorkspaceProjectsPage() {
  const router = useRouter();
  const { workspaceSlug, workspaceUrl } = useWorkspaceUrl();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  // All projects expanded by default
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [initialized, setInitialized] = useState(false);

  const utils = trpc.useUtils();

  const { data: projects, isLoading } = trpc.projects.list.useQuery(
    { workspaceSlug: workspaceSlug ?? "" },
    { enabled: !!workspaceSlug }
  );

  // Auto-expand all projects on first load
  if (projects && !initialized) {
    setExpandedProjects(new Set(projects.map((p) => p.id)));
    setInitialized(true);
  }

  const createProject = trpc.projects.create.useMutation({
    onSuccess: () => {
      utils.projects.list.invalidate();
      setIsCreateOpen(false);
      setNewProjectName("");
    },
  });

  const handleCreateProject = useCallback(() => {
    if (!workspaceSlug || !newProjectName.trim()) return;
    createProject.mutate({
      workspaceSlug,
      name: newProjectName.trim(),
    });
  }, [workspaceSlug, newProjectName, createProject]);

  const handleNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setNewProjectName(e.target.value);
    },
    []
  );

  const handleOpenChange = useCallback((open: boolean) => {
    setIsCreateOpen(open);
    if (!open) setNewProjectName("");
  }, []);

  const handleNavigate = useCallback(
    (projectId: string, tab?: string) => {
      const url = tab
        ? workspaceUrl(`/projects/${projectId}?tab=${tab}`)
        : workspaceUrl(`/projects/${projectId}`);
      router.push(url);
    },
    [router, workspaceUrl]
  );

  const toggleProject = useCallback((projectId: string) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      return next;
    });
  }, []);

  const formatRelativeTime = (dateStr: string | null) => {
    if (!dateStr) return "No activity";
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const renderProjectCard = (project: ProjectListItem) => {
    const isExpanded = expandedProjects.has(project.id);

    return (
      <Collapsible
        key={project.id}
        open={isExpanded}
        onOpenChange={() => toggleProject(project.id)}
      >
        <div className="border-b last:border-b-0">
          {/* Main Row - 2 Lines */}
          <CollapsibleTrigger asChild>
            <div className="flex items-start gap-4 px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors">
              <ChevronDown
                className={cn(
                  "h-4 w-4 text-muted-foreground transition-transform mt-1",
                  !isExpanded && "-rotate-90"
                )}
              />
              <div className="rounded-md bg-primary/10 p-2">
                <FolderKanban className="h-4 w-4 text-primary" />
              </div>
              {/* Left side - Name and metadata */}
              <div className="flex-1 min-w-0">
                <div className="font-medium">{project.name}</div>
                <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Activity className="h-3 w-3" />
                    {project.traceCount.toLocaleString()} traces
                  </span>
                  <span className="flex items-center gap-1">
                    <Layers className="h-3 w-3" />
                    {project.spanCount.toLocaleString()} spans
                  </span>
                  <span className="flex items-center gap-1">
                    <ScrollText className="h-3 w-3" />
                    {project.logCount.toLocaleString()} logs
                  </span>
                </div>
              </div>
              {/* Right side - Last activity and created date */}
              <div className="text-right shrink-0">
                <div className="flex items-center gap-1 text-sm text-muted-foreground justify-end">
                  <Clock className="h-3 w-3" />
                  {formatRelativeTime(project.lastActivityAt)}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Created {new Date(project.createdAt).toLocaleDateString()}
                </div>
              </div>
            </div>
          </CollapsibleTrigger>

          {/* Expanded Content */}
          <CollapsibleContent>
            <div className="pl-12 pr-4 pb-3 flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-2"
                onClick={() => handleNavigate(project.id, "traces")}
              >
                <Activity className="h-3.5 w-3.5" />
                Traces
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-2"
                onClick={() => handleNavigate(project.id, "logs")}
              >
                <ScrollText className="h-3.5 w-3.5" />
                Logs
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 ml-auto"
                onClick={() => handleNavigate(project.id)}
              >
                Open Project →
              </Button>
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>
    );
  };

  const renderSkeletonCard = (index: number) => (
    <div key={index} className="border-b last:border-b-0">
      <div className="flex items-start gap-4 px-4 py-3">
        <Skeleton className="h-4 w-4 mt-1" />
        <Skeleton className="h-8 w-8 rounded-md" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-40" />
          <div className="flex gap-4">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
        <div className="text-right space-y-2">
          <Skeleton className="h-4 w-20 ml-auto" />
          <Skeleton className="h-3 w-24 ml-auto" />
        </div>
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Projects</h1>
            <p className="text-muted-foreground">
              Manage your AI observability projects.
            </p>
          </div>
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="rounded-md border">
          {[0, 1, 2].map(renderSkeletonCard)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Projects</h1>
          <p className="text-muted-foreground">
            Manage your AI observability projects.
          </p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={handleOpenChange}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              New Project
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Project</DialogTitle>
              <DialogDescription>
                Create a new project to start monitoring your AI application.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Project Name</Label>
                <Input
                  id="name"
                  placeholder="My AI Project"
                  value={newProjectName}
                  onChange={handleNameChange}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={handleCreateProject}
                disabled={!newProjectName.trim() || createProject.isPending}
              >
                {createProject.isPending ? "Creating..." : "Create Project"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {projects && projects.length > 0 ? (
        <div className="rounded-md border">
          {projects.map(renderProjectCard)}
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>No projects yet</CardTitle>
            <CardDescription>
              Create your first project to start monitoring your AI
              applications.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => setIsCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create Project
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
