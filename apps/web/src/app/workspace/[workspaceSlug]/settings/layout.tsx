"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Settings, Users, Key, Building2, Globe, Bell, Github, Puzzle, Palette } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWorkspaceUrl } from "@/hooks/use-workspace-url";
import { AdminWorkspaceSwitcher } from "@/components/settings/admin-workspace-switcher";

interface SettingsNavItem {
  title: string;
  path: string;
  icon: typeof Settings;
}

const SETTINGS_NAV_ITEMS: SettingsNavItem[] = [
  { title: "General", path: "/settings", icon: Building2 },
  { title: "Members", path: "/settings/members", icon: Users },
  { title: "Repositories", path: "/settings/repositories", icon: Github },
  { title: "Domains", path: "/settings/domains", icon: Globe },
  { title: "Channels", path: "/settings/channels", icon: Bell },
  { title: "Extensions", path: "/settings/extensions", icon: Puzzle },
  { title: "Appearance", path: "/settings/appearance", icon: Palette },
  { title: "API Keys", path: "/settings/api-keys", icon: Key },
];

interface SettingsLayoutProps {
  children: React.ReactNode;
}

export default function SettingsLayout({ children }: SettingsLayoutProps) {
  const pathname = usePathname();
  const { workspaceUrl } = useWorkspaceUrl();

  const isActive = (path: string) => {
    const href = workspaceUrl(path);
    if (path === "/settings") {
      // General - exact match
      return pathname === href;
    }
    return pathname.startsWith(href);
  };

  const renderNavItem = (item: SettingsNavItem) => {
    const href = workspaceUrl(item.path);
    const Icon = item.icon;
    const active = isActive(item.path);

    return (
      <Link
        key={item.path}
        href={href}
        className={cn(
          "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
          active
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        )}
      >
        <Icon className="h-4 w-4" />
        {item.title}
      </Link>
    );
  };

  return (
    <div className="space-y-6">
      {/* Admin Workspace Switcher - Only shows for system admins */}
      <div className="flex justify-end">
        <AdminWorkspaceSwitcher />
      </div>

      <div className="flex gap-6">
        {/* Inner Settings Sidebar */}
        <aside className="w-56 shrink-0">
          <nav className="flex flex-col gap-1">
            {SETTINGS_NAV_ITEMS.map(renderNavItem)}
          </nav>
        </aside>

        {/* Settings Content */}
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}
