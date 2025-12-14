"use client";

import { useState, Fragment } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useWorkspaceUrl } from "@/hooks/use-workspace-url";
import { trpc } from "@/lib/trpc/client";
import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface NavItem {
  label: string;
  href?: string;
}

/** Settings pages mapping */
const SETTINGS_PAGES: Record<string, string> = {
  "/settings": "General",
  "/settings/members": "Members",
  "/settings/repositories": "Repositories",
  "/settings/domains": "Domains",
  "/settings/channels": "Channels",
  "/settings/api-keys": "API Keys",
};

/** Get the current settings page label from pathname */
function getSettingsPageLabel(pathname: string): string {
  // Extract the settings path portion (e.g., "/settings/members")
  const match = pathname.match(/\/workspace\/[^/]+(.*)$/);
  const settingsPath = match?.[1] ?? "";

  return SETTINGS_PAGES[settingsPath] ?? "Settings";
}

/** Number of items to always display (first and last) */
const ITEMS_TO_DISPLAY = 3;

export function SettingsBreadcrumb() {
  const [open, setOpen] = useState(false);
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const pathname = usePathname();
  const { workspaceSlug, workspaceUrl } = useWorkspaceUrl();

  // Fetch workspace to get the actual name
  const { data: workspace } = trpc.workspaces.getBySlug.useQuery(
    { workspaceSlug: workspaceSlug ?? "" },
    { enabled: !!workspaceSlug }
  );

  // Get the current page label
  const currentPageLabel = getSettingsPageLabel(pathname);
  const isOnGeneralSettings = currentPageLabel === "General";

  // Use workspace name if available, otherwise fall back to slug
  const workspaceName = workspace?.name ?? workspaceSlug ?? "Workspace";

  // Build breadcrumb items
  const items: NavItem[] = [
    { label: workspaceName, href: workspaceUrl("/") },
    { label: "Settings", href: workspaceUrl("/settings") },
  ];

  // Only add the specific page if not on General settings
  if (!isOnGeneralSettings) {
    items.push({ label: currentPageLabel });
  }

  // If we only have 2-3 items, no need for ellipsis
  if (items.length <= ITEMS_TO_DISPLAY) {
    return (
      <Breadcrumb>
        <BreadcrumbList>
          {items.map((item, index) => {
            const isLast = index === items.length - 1;

            return (
              <Fragment key={item.label}>
                <BreadcrumbItem>
                  {item.href && !isLast ? (
                    <BreadcrumbLink asChild>
                      <Link href={item.href}>{item.label}</Link>
                    </BreadcrumbLink>
                  ) : (
                    <BreadcrumbPage>{item.label}</BreadcrumbPage>
                  )}
                </BreadcrumbItem>
                {!isLast && <BreadcrumbSeparator />}
              </Fragment>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>
    );
  }

  // For longer breadcrumbs, use ellipsis with dropdown/drawer
  // items always has at least 2 elements, so these are guaranteed to be defined
  const firstItem = items[0]!;
  const middleItems = items.slice(1, -1);
  const lastItem = items[items.length - 1]!;

  const renderMiddleItemsDesktop = () => (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        className="flex items-center gap-1"
        aria-label="Toggle menu"
      >
        <BreadcrumbEllipsis className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {middleItems.map((item) => (
          <DropdownMenuItem key={item.label} asChild>
            <Link href={item.href ?? "#"}>{item.label}</Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const handleDrawerLinkClick = () => {
    setOpen(false);
  };

  const renderMiddleItemsMobile = () => (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger aria-label="Toggle Menu">
        <BreadcrumbEllipsis className="h-4 w-4" />
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader className="text-left">
          <DrawerTitle>Navigate to</DrawerTitle>
          <DrawerDescription>Select a page to navigate to.</DrawerDescription>
        </DrawerHeader>
        <div className="grid gap-1 px-4">
          {middleItems.map((item) => (
            <Link
              key={item.label}
              href={item.href ?? "#"}
              className="py-1 text-sm"
              onClick={handleDrawerLinkClick}
            >
              {item.label}
            </Link>
          ))}
        </div>
        <DrawerFooter className="pt-4">
          <DrawerClose asChild>
            <Button variant="outline">Close</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {/* First item - always visible */}
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link href={firstItem.href ?? "/"}>{firstItem.label}</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />

        {/* Middle items - collapsed into ellipsis */}
        {middleItems.length > 0 && (
          <>
            <BreadcrumbItem>
              {isDesktop
                ? renderMiddleItemsDesktop()
                : renderMiddleItemsMobile()}
            </BreadcrumbItem>
            <BreadcrumbSeparator />
          </>
        )}

        {/* Last item - always visible */}
        <BreadcrumbItem>
          <BreadcrumbPage className="max-w-20 truncate md:max-w-none">
            {lastItem.label}
          </BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}
