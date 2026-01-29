"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWorkspaceUrl } from "@/hooks/use-workspace-url";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

interface WorkspaceBreadcrumbProps {
  workspaceName: string;
}

/** Page mapping for workspace sections */
const PAGE_LABELS: Record<string, string> = {
  "/projects": "Projects",
  "/prompts": "Prompts",
  "/knowledge": "Knowledge Base",
  "/settings": "Settings",
};

/** Get the current page label from pathname */
function getPageLabel(pathname: string): string | null {
  const match = pathname.match(/\/workspace\/[^/]+(.*)$/);
  const pagePath = match?.[1] ?? "";

  // Check for exact match first
  if (PAGE_LABELS[pagePath]) {
    return PAGE_LABELS[pagePath];
  }

  // Check for partial match (e.g., /projects/123)
  for (const [path, label] of Object.entries(PAGE_LABELS)) {
    if (pagePath.startsWith(path)) {
      return label;
    }
  }

  return null;
}

export function WorkspaceBreadcrumb({ workspaceName }: WorkspaceBreadcrumbProps) {
  const pathname = usePathname();
  const { workspaceUrl } = useWorkspaceUrl();

  const pageLabel = getPageLabel(pathname);

  // If on workspace root, just show workspace name
  if (!pageLabel) {
    return (
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbPage>{workspaceName}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    );
  }

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link href={workspaceUrl("/")}>{workspaceName}</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbPage>{pageLabel}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}
