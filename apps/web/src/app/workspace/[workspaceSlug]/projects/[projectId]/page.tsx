"use client";

import Link from "next/link";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { useCallback } from "react";
import { ArrowLeft, Activity, MessagesSquare, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc/client";
import { useWorkspaceUrl } from "@/hooks/use-workspace-url";
// NOTE: TracesTable and SessionsTable removed - will be reworked for OTLP-first design
import { TrackedUsersTable } from "@/components/tracked-users/tracked-users-table";
import { AlertsPanel } from "@/components/alerts/alerts-panel";
import { EvalsPanel } from "@/components/evals";
import { useProjectUserCount } from "@/hooks/project-user-count/use-project-user-count";
import { Badge } from "@/components/ui/badge";

type ProjectTab = "traces" | "sessions" | "users";

export default function ProjectDetailPage() {
  const params = useParams<{ workspaceSlug: string; projectId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { workspaceSlug, workspaceUrl } = useWorkspaceUrl();
  const projectId = params.projectId;

  const currentTab = (searchParams.get("tab") as ProjectTab) || "traces";

  const { data: project, isLoading: isLoadingProject } =
    trpc.projects.get.useQuery(
      { workspaceSlug: workspaceSlug ?? "", projectId },
      { enabled: !!workspaceSlug && !!projectId }
    );

  const { userCount, isLoading: isLoadingUsers } = useProjectUserCount({
    workspaceSlug: workspaceSlug ?? "",
    projectId,
  });

  const handleTabChange = useCallback(
    (tab: string) => {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", tab);
      router.push(url.pathname + url.search);
    },
    [router]
  );

  if (isLoadingProject) {
    return (
      <div className="space-y-6 p-4">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <div>
            <Skeleton className="h-8 w-48" />
            <Skeleton className="mt-1 h-4 w-32" />
          </div>
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="space-y-6 p-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href={workspaceUrl("/projects")}>
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              Project Not Found
            </h1>
            <p className="text-muted-foreground">
              This project does not exist or you don&apos;t have access.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href={workspaceUrl("/projects")}>
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">{project.name}</h1>
              {isLoadingUsers ? (
                <Skeleton className="h-6 w-20" />
              ) : (
                <Badge variant="secondary" className="gap-1">
                  <Users className="h-3 w-3" />
                  {userCount} users
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground">
              Created {new Date(project.createdAt).toLocaleDateString()}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <EvalsPanel workspaceSlug={workspaceSlug ?? ""} projectId={projectId} />
          <AlertsPanel workspaceSlug={workspaceSlug ?? ""} projectId={projectId} />
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={currentTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="traces" className="gap-2">
            <Activity className="h-4 w-4" />
            Traces
          </TabsTrigger>
          <TabsTrigger value="sessions" className="gap-2">
            <MessagesSquare className="h-4 w-4" />
            Sessions
          </TabsTrigger>
          <TabsTrigger value="users" className="gap-2">
            <Users className="h-4 w-4" />
            Users
          </TabsTrigger>
        </TabsList>

        <TabsContent value="traces" className="mt-4">
          {/* NOTE: TracesTable removed - will be reworked for OTLP-first design */}
          <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
            <Activity className="mx-auto mb-2 h-8 w-8" />
            <p className="text-lg font-medium">Traces</p>
            <p className="text-sm">Coming soon with OTLP-first telemetry</p>
          </div>
        </TabsContent>

        <TabsContent value="sessions" className="mt-4">
          {/* NOTE: SessionsTable removed - will be reworked for OTLP-first design */}
          <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
            <MessagesSquare className="mx-auto mb-2 h-8 w-8" />
            <p className="text-lg font-medium">Sessions</p>
            <p className="text-sm">Coming soon with OTLP-first telemetry</p>
          </div>
        </TabsContent>

        <TabsContent value="users" className="mt-4">
          <TrackedUsersTable
            workspaceSlug={workspaceSlug ?? ""}
            projectId={projectId}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
