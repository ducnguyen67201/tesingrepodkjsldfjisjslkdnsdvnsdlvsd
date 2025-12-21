"use client";

import Link from "next/link";
import { LayoutDashboard, FolderKanban, Activity, FileCode, Settings } from "lucide-react";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import { useWorkspaceUrl } from "@/hooks/use-workspace-url";

interface NavItem {
  title: string;
  path: string;
  icon: typeof LayoutDashboard;
}

const NAV_ITEMS: NavItem[] = [
  { title: "Dashboard", path: "", icon: LayoutDashboard },
  { title: "Projects", path: "/projects", icon: FolderKanban },
  { title: "Traces", path: "/traces", icon: Activity },
  { title: "Prompts", path: "/prompts", icon: FileCode },
  { title: "Settings", path: "/settings", icon: Settings },
];

export function NavMain() {
  const { workspaceUrl, isActive } = useWorkspaceUrl();

  const renderNavItem = (item: NavItem) => {
    const href = workspaceUrl(item.path);
    const Icon = item.icon;
    const active = isActive(item.path, item.path === "");

    return (
      <SidebarMenuItem key={item.path || "dashboard"}>
        <SidebarMenuButton asChild isActive={active} tooltip={item.title}>
          <Link href={href}>
            <Icon />
            <span>{item.title}</span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Navigation</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>{NAV_ITEMS.map(renderNavItem)}</SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
