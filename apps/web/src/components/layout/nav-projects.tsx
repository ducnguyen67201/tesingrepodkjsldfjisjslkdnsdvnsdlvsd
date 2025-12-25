"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronRight,
  FolderKanban,
  Activity,
  ScrollText,
  Plus,
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  SidebarMenuSkeleton,
  useSidebar,
} from "@/components/ui/sidebar";
import { trpc } from "@/lib/trpc/client";
import { useWorkspaceUrl } from "@/hooks/use-workspace-url";
import { cn } from "@/lib/utils";

interface ProjectSubItem {
  title: string;
  tab: string;
  icon: typeof Activity;
}

const PROJECT_SUB_ITEMS: ProjectSubItem[] = [
  { title: "Traces", tab: "traces", icon: Activity },
  { title: "Logs", tab: "logs", icon: ScrollText },
];

export function NavProjects() {
  const pathname = usePathname();
  const { workspaceSlug, workspaceUrl } = useWorkspaceUrl();
  const { state: sidebarState, isMobile } = useSidebar();
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(
    new Set()
  );
  const [isProjectsOpen, setIsProjectsOpen] = useState(true);

  const isCollapsed = sidebarState === "collapsed" && !isMobile;

  const { data: projects, isLoading } = trpc.projects.list.useQuery(
    { workspaceSlug: workspaceSlug ?? "" },
    { enabled: !!workspaceSlug }
  );

  const toggleProject = (projectId: string) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      return next;
    });
  };

  const isProjectActive = (projectId: string) => {
    return pathname?.includes(`/projects/${projectId}`);
  };

  const isSubItemActive = (projectId: string, tab: string) => {
    return pathname?.includes(`/projects/${projectId}`) && pathname?.includes(`tab=${tab}`);
  };

  // Auto-expand active project
  const activeProjectId = projects?.find((p) => isProjectActive(p.id))?.id;
  if (activeProjectId && !expandedProjects.has(activeProjectId)) {
    setExpandedProjects((prev) => new Set(prev).add(activeProjectId));
  }

  if (!workspaceSlug) {
    return null;
  }

  // Hover card content for collapsed sidebar
  const renderHoverCardContent = () => (
    <HoverCardContent
      side="right"
      align="start"
      sideOffset={8}
      className="w-48 p-2"
    >
      <div className="space-y-1">
        <div className="px-2 py-1.5 text-sm font-semibold">Projects</div>
        <div className="h-px bg-border" />

        {/* New Project Link */}
        <Link
          href={workspaceUrl("/projects?new=true")}
          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
        >
          <Plus className="h-4 w-4" />
          <span>New Project</span>
        </Link>

        {/* Loading State */}
        {isLoading && (
          <div className="px-2 py-1.5 text-sm text-muted-foreground">
            Loading...
          </div>
        )}

        {/* Projects List */}
        {projects?.map((project) => (
          <div key={project.id} className="space-y-0.5">
            <div className="px-2 py-1 text-sm font-medium text-muted-foreground truncate">
              {project.name}
            </div>
            {PROJECT_SUB_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = isSubItemActive(project.id, item.tab);
              return (
                <Link
                  key={item.tab}
                  href={workspaceUrl(`/projects/${project.id}?tab=${item.tab}`)}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground",
                    isActive && "bg-accent text-accent-foreground"
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{item.title}</span>
                </Link>
              );
            })}
          </div>
        ))}

        {/* Empty State */}
        {!isLoading && projects?.length === 0 && (
          <div className="px-2 py-1.5 text-sm text-muted-foreground">
            No projects yet
          </div>
        )}
      </div>
    </HoverCardContent>
  );

  // Button content (shared between collapsed and expanded states)
  const projectsButton = (
    <SidebarMenuButton tooltip={isCollapsed ? undefined : "Projects"}>
      <FolderKanban />
      <span>Projects</span>
      <ChevronRight
        className={cn(
          "ml-auto transition-transform",
          isProjectsOpen && "rotate-90"
        )}
      />
    </SidebarMenuButton>
  );

  return (
    <SidebarMenu>
      <Collapsible open={isProjectsOpen} onOpenChange={setIsProjectsOpen}>
        <SidebarMenuItem>
          {isCollapsed ? (
            <HoverCard openDelay={100} closeDelay={100}>
              <HoverCardTrigger asChild>{projectsButton}</HoverCardTrigger>
              {renderHoverCardContent()}
            </HoverCard>
          ) : (
            <CollapsibleTrigger asChild>{projectsButton}</CollapsibleTrigger>
          )}
          <CollapsibleContent>
            <SidebarMenuSub>
              {/* New Project Button */}
              <SidebarMenuSubItem>
                <SidebarMenuSubButton asChild size="sm">
                  <Link href={workspaceUrl("/projects?new=true")}>
                    <Plus className="h-3 w-3" />
                    <span>New Project</span>
                  </Link>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>

              {/* Loading State */}
              {isLoading && (
                <>
                  <SidebarMenuSkeleton />
                  <SidebarMenuSkeleton />
                </>
              )}

              {/* Projects List */}
              {projects?.map((project) => (
                <Collapsible
                  key={project.id}
                  open={expandedProjects.has(project.id)}
                  onOpenChange={() => toggleProject(project.id)}
                >
                  <SidebarMenuSubItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuSubButton
                        size="sm"
                        isActive={isProjectActive(project.id)}
                        className="cursor-pointer"
                      >
                        <span className="truncate">{project.name}</span>
                        <ChevronRight
                          className={cn(
                            "ml-auto h-3 w-3 transition-transform",
                            expandedProjects.has(project.id) && "rotate-90"
                          )}
                        />
                      </SidebarMenuSubButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub>
                        {PROJECT_SUB_ITEMS.map((item) => {
                          const Icon = item.icon;
                          return (
                            <SidebarMenuSubItem key={item.tab}>
                              <SidebarMenuSubButton
                                asChild
                                size="sm"
                                isActive={isSubItemActive(project.id, item.tab)}
                              >
                                <Link
                                  href={workspaceUrl(
                                    `/projects/${project.id}?tab=${item.tab}`
                                  )}
                                >
                                  <Icon className="h-3 w-3" />
                                  <span>{item.title}</span>
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          );
                        })}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </SidebarMenuSubItem>
                </Collapsible>
              ))}

              {/* Empty State */}
              {!isLoading && projects?.length === 0 && (
                <SidebarMenuSubItem>
                  <span className="px-2 py-1 text-xs text-muted-foreground">
                    No projects yet
                  </span>
                </SidebarMenuSubItem>
              )}
            </SidebarMenuSub>
          </CollapsibleContent>
        </SidebarMenuItem>
      </Collapsible>
    </SidebarMenu>
  );
}
