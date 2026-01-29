"use client";

import { usePathname } from "next/navigation";
import { useMemo, useCallback } from "react";

/**
 * Extract workspace slug from current URL path.
 * Handles paths like /workspace/{slug}/...
 */
function extractWorkspaceSlug(pathname: string): string | null {
  const match = pathname.match(/^\/workspace\/([^/]+)/);
  return match?.[1] ?? null;
}

interface UseWorkspaceUrlReturn {
  /** Current workspace slug from URL, null if not in workspace context */
  workspaceSlug: string | null;
  /** Whether we're currently in a workspace context */
  isInWorkspace: boolean;
  /** Generate a workspace-relative URL */
  workspaceUrl: (path: string) => string;
  /** Check if a path is active (for navigation highlighting) */
  isActive: (path: string, exact?: boolean) => boolean;
}

/**
 * Global hook for workspace URL management.
 *
 * Usage:
 * ```tsx
 * const { workspaceSlug, workspaceUrl, isActive } = useWorkspaceUrl();
 *
 * // Generate URLs
 * <Link href={workspaceUrl("/projects")}>Projects</Link>
 * <Link href={workspaceUrl("/settings")}>Settings</Link>
 *
 * // Check active state
 * <NavItem isActive={isActive("/projects")}>Projects</NavItem>
 * ```
 */
export function useWorkspaceUrl(): UseWorkspaceUrlReturn {
  const pathname = usePathname();

  const workspaceSlug = useMemo(
    () => extractWorkspaceSlug(pathname),
    [pathname]
  );

  const isInWorkspace = workspaceSlug !== null;

  const workspaceUrl = useCallback(
    (path: string): string => {
      if (workspaceSlug) {
        // Ensure path starts with /
        const normalizedPath = path.startsWith("/") ? path : `/${path}`;
        // Handle empty path for workspace root
        if (normalizedPath === "/") {
          return `/workspace/${workspaceSlug}`;
        }
        return `/workspace/${workspaceSlug}${normalizedPath}`;
      }
      // Fallback for non-workspace context
      return path || "/";
    },
    [workspaceSlug]
  );

  const isActive = useCallback(
    (path: string, exact = false): boolean => {
      const href = workspaceUrl(path);
      if (exact || path === "" || path === "/") {
        return pathname === href;
      }
      return pathname.startsWith(href);
    },
    [pathname, workspaceUrl]
  );

  return {
    workspaceSlug,
    isInWorkspace,
    workspaceUrl,
    isActive,
  };
}
