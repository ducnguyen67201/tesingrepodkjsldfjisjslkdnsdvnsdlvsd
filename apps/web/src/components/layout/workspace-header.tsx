"use client";

import { usePathname } from "next/navigation";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { SettingsBreadcrumb } from "@/components/settings/settings-breadcrumb";
import { WorkspaceBreadcrumb } from "@/components/layout/workspace-breadcrumb";

interface WorkspaceHeaderProps {
  workspaceName: string;
}

export function WorkspaceHeader({ workspaceName }: WorkspaceHeaderProps) {
  const pathname = usePathname();

  // Check if we're in settings section
  const isSettingsPage = pathname.includes("/settings");

  return (
    <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 h-4" />
      {isSettingsPage ? (
        <SettingsBreadcrumb />
      ) : (
        <WorkspaceBreadcrumb workspaceName={workspaceName} />
      )}
    </header>
  );
}
