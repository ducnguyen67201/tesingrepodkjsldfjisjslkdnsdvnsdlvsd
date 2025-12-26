"use client";

import type { WorkspaceListItem } from "@ducsigr/api/client";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { NavMain } from "./nav-main";
import { NavSettings } from "./nav-settings";
import { NavUser } from "./nav-user";
import { ThemeSwitcher } from "./theme-switcher";
import { WorkspaceSwitcher } from "./workspace-switcher";

interface AppSidebarProps {
  workspace?: WorkspaceListItem;
}

export function AppSidebar({ workspace }: AppSidebarProps) {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        {workspace && <WorkspaceSwitcher currentWorkspace={workspace} />}
      </SidebarHeader>

      <SidebarContent>
        <NavMain />
      </SidebarContent>

      <SidebarFooter>
        <NavSettings />
        <SidebarSeparator />
        <ThemeSwitcher />
        <SidebarSeparator />
        <NavUser />
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
