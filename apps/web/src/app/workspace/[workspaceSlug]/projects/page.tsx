"use client";

import { useState, useCallback } from "react";
import { Plus, FolderKanban } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc/client";
import { useWorkspaceUrl } from "@/hooks/use-workspace-url";
import type { ProjectListItem } from "@cognobserve/api/client";

export default function WorkspaceProjectsPage() {
  const { workspaceSlug, workspaceUrl } = useWorkspaceUrl();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");

  const utils = trpc.useUtils();

  const { data: projects, isLoading } = trpc.projects.list.useQuery(
    { workspaceSlug: workspaceSlug ?? "" },
    { enabled: !!workspaceSlug }
  );

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

  const renderProjectRow = (project: ProjectListItem) => (
    <TableRow
      key={project.id}
      className="cursor-pointer hover:bg-muted/50"
      onClick={() =>
        (window.location.href = workspaceUrl(`/projects/${project.id}`))
      }
    >
      <TableCell>
        <div className="flex items-center gap-3">
          <div className="rounded-md bg-primary/10 p-2">
            <FolderKanban className="h-4 w-4 text-primary" />
          </div>
          <span className="font-medium">{project.name}</span>
        </div>
      </TableCell>
      <TableCell className="text-muted-foreground">
        {project.traceCount} {project.traceCount === 1 ? "trace" : "traces"}
      </TableCell>
      <TableCell className="text-muted-foreground">
        {new Date(project.createdAt).toLocaleDateString()}
      </TableCell>
    </TableRow>
  );

  const renderSkeletonRow = (index: number) => (
    <TableRow key={index}>
      <TableCell>
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded-md" />
          <Skeleton className="h-4 w-32" />
        </div>
      </TableCell>
      <TableCell>
        <Skeleton className="h-4 w-16" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-4 w-24" />
      </TableCell>
    </TableRow>
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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Traces</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>{[0, 1, 2].map(renderSkeletonRow)}</TableBody>
          </Table>
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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Traces</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>{projects.map(renderProjectRow)}</TableBody>
          </Table>
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
