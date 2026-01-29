"use client";

import { useParams } from "next/navigation";
import { useWorkspaceUrl } from "@/hooks/use-workspace-url";
import { ProjectFilterProvider, useProjectFilters } from "@/components/costs/cost-context";
import { CostSidebarPanel } from "@/components/costs/cost-sidebar-panel";

interface ProjectLayoutProps {
  children: React.ReactNode;
}

function ProjectLayoutContent({ children }: ProjectLayoutProps) {
  const params = useParams<{ workspaceSlug: string; projectId: string }>();
  const { workspaceSlug } = useWorkspaceUrl();
  const projectId = params.projectId;
  const { filters, timeRange, customRange } = useProjectFilters();

  return (
    <div className="-m-4 flex h-[calc(100vh-4rem)]">
      {/* Main content area */}
      <div className="flex-1 overflow-auto">{children}</div>

      {/* Cost Summary Sidebar - Full height */}
      <aside className="w-72 shrink-0 border-l bg-muted/30">
        <CostSidebarPanel
          workspaceSlug={workspaceSlug ?? ""}
          projectId={projectId}
          filters={filters}
          timeRange={timeRange}
          customRange={customRange}
        />
      </aside>
    </div>
  );
}

export default function ProjectLayout({ children }: ProjectLayoutProps) {
  return (
    <ProjectFilterProvider>
      <ProjectLayoutContent>{children}</ProjectLayoutContent>
    </ProjectFilterProvider>
  );
}
