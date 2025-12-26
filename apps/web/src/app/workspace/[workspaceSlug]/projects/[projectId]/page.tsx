"use client";

import Link from "next/link";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { useCallback } from "react";
import { ArrowLeft, Activity, MessagesSquare, Users, ScrollText, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc/client";
import { useWorkspaceUrl } from "@/hooks/use-workspace-url";
import { TracesTableV2 } from "@/components/traces";
import { ProjectLogsTable } from "@/components/logs/project-logs-table";
import { TrackedUsersTable } from "@/components/tracked-users/tracked-users-table";
import { AlertsPanel } from "@/components/alerts/alerts-panel";
import { EvalsPanel } from "@/components/evals";
import { DashboardView } from "@/components/dashboard";
import { useProjectUserCount } from "@/hooks/project-user-count/use-project-user-count";
import { Badge } from "@/components/ui/badge";

type ProjectTab = "metrics" | "traces" | "logs" | "sessions" | "users";

export default function ProjectDetailPage() {
  const params = useParams<{ workspaceSlug: string; projectId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { workspaceSlug, workspaceUrl } = useWorkspaceUrl();
  const projectId = params.projectId;

  const currentTab = (searchParams.get("tab") as ProjectTab) || "metrics";

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
    <div className="space-y-3 p-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
            <Link href={workspaceUrl("/projects")}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold">{project.name}</h1>
              {isLoadingUsers ? (
                <Skeleton className="h-5 w-16" />
              ) : (
                <Badge variant="secondary" className="h-5 gap-1 text-[10px] px-1.5">
                  <Users className="h-2.5 w-2.5" />
                  {userCount} users
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Created {new Date(project.createdAt).toLocaleDateString()}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <EvalsPanel workspaceSlug={workspaceSlug ?? ""} projectId={projectId} />
          <AlertsPanel workspaceSlug={workspaceSlug ?? ""} projectId={projectId} />
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={currentTab} onValueChange={handleTabChange}>
        <TabsList className="h-8">
          <TabsTrigger value="metrics" className="h-7 gap-1.5 text-xs px-3">
            <BarChart3 className="h-3 w-3" />
            Metrics
          </TabsTrigger>
          <TabsTrigger value="traces" className="h-7 gap-1.5 text-xs px-3">
            <Activity className="h-3 w-3" />
            Traces
          </TabsTrigger>
          <TabsTrigger value="logs" className="h-7 gap-1.5 text-xs px-3">
            <ScrollText className="h-3 w-3" />
            Logs
          </TabsTrigger>
          <TabsTrigger value="sessions" className="h-7 gap-1.5 text-xs px-3">
            <MessagesSquare className="h-3 w-3" />
            Sessions
          </TabsTrigger>
          <TabsTrigger value="users" className="h-7 gap-1.5 text-xs px-3">
            <Users className="h-3 w-3" />
            Users
          </TabsTrigger>
        </TabsList>

        <TabsContent value="metrics" className="mt-2">
          <DashboardView
            workspaceSlug={workspaceSlug ?? ""}
            projectId={projectId}
          />
        </TabsContent>

        <TabsContent value="traces" className="mt-2">
          <TracesTableV2
            workspaceSlug={workspaceSlug ?? ""}
            projectId={projectId}
          />
        </TabsContent>

        <TabsContent value="logs" className="mt-2">
          <ProjectLogsTable
            workspaceSlug={workspaceSlug ?? ""}
            projectId={projectId}
          />
        </TabsContent>

        <TabsContent value="sessions" className="mt-2">
          {/* NOTE: SessionsTable removed - will be reworked for OTLP-first design */}
          <div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">
            <MessagesSquare className="mx-auto mb-2 h-6 w-6" />
            <p className="text-sm font-medium">Sessions</p>
            <p className="text-xs">Coming soon with OTLP-first telemetry</p>
          </div>
        </TabsContent>

        <TabsContent value="users" className="mt-2">
          <TrackedUsersTable
            workspaceSlug={workspaceSlug ?? ""}
            projectId={projectId}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
