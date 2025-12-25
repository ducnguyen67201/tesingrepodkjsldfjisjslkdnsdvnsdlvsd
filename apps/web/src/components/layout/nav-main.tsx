"use client";

import Link from "next/link";
import { LayoutDashboard, FileCode, BookOpen, Settings } from "lucide-react";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import { useWorkspaceUrl } from "@/hooks/use-workspace-url";
import { NavProjects } from "./nav-projects";

interface NavItem {
  title: string;
  path: string;
  icon: typeof LayoutDashboard;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { title: "Dashboard", path: "", icon: LayoutDashboard },
    ],
  },
  {
    label: "Developer Tools",
    items: [
      { title: "Prompts", path: "/prompts", icon: FileCode },
      { title: "Knowledge", path: "/knowledge", icon: BookOpen },
    ],
  },
  {
    label: "Configuration",
    items: [
      { title: "Settings", path: "/settings", icon: Settings },
    ],
  },
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

  const renderGroup = (group: NavGroup) => (
    <SidebarGroup key={group.label}>
      <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>{group.items.map(renderNavItem)}</SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );

  return (
    <>
      {/* Overview */}
      {renderGroup(NAV_GROUPS[0]!)}

      {/* Observability - Projects with expandable sub-items */}
      <SidebarGroup>
        <SidebarGroupLabel>Observability</SidebarGroupLabel>
        <SidebarGroupContent>
          <NavProjects />
        </SidebarGroupContent>
      </SidebarGroup>

      {/* Developer Tools & Configuration */}
      {NAV_GROUPS.slice(1).map(renderGroup)}
    </>
  );
}
