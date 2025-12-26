"use client";

import Link from "next/link";
import { Settings } from "lucide-react";
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import { useWorkspaceUrl } from "@/hooks/use-workspace-url";

export function NavSettings() {
  const { workspaceUrl, isActive } = useWorkspaceUrl();
  const href = workspaceUrl("/settings");
  const active = isActive("/settings");

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton asChild isActive={active} tooltip="Settings">
          <Link href={href}>
            <Settings />
            <span>Settings</span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
