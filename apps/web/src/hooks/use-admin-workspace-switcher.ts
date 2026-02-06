"use client";

import { useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import type { WorkspaceListItem } from "@ducsigr/api/client";

import { trpc } from "@/lib/trpc/client";
import { useSystemAdmin } from "@/hooks/use-system-admin";

interface UseAdminWorkspaceSwitcherReturn {
  isSystemAdmin: boolean;
  isLoading: boolean;
  currentSlug: string | undefined;
  currentWorkspace: WorkspaceListItem | undefined;
  workspaces: WorkspaceListItem[];
  selectWorkspace: (slug: string) => void;
}

/**
 * Hook that encapsulates admin workspace switcher logic.
 * Fetches all workspaces for system admins and provides navigation.
 */
export function useAdminWorkspaceSwitcher(): UseAdminWorkspaceSwitcherReturn {
  const params = useParams();
  const router = useRouter();

  const rawSlug = params.workspaceSlug;
  const currentSlug = typeof rawSlug === "string" ? rawSlug : undefined;

  const { isSystemAdmin, isLoading: isAdminLoading } = useSystemAdmin();

  const { data: workspaces, isLoading: isWorkspacesLoading } =
    trpc.workspaces.listWithDetails.useQuery(undefined, {
      enabled: isSystemAdmin,
      staleTime: 5 * 60 * 1000,
    });

  const selectWorkspace = useCallback(
    (slug: string) => {
      if (slug !== currentSlug) {
        router.push(`/workspace/${slug}/settings`);
      }
    },
    [currentSlug, router]
  );

  const currentWorkspace = workspaces?.find((w) => w.slug === currentSlug);

  return {
    isSystemAdmin: !isAdminLoading && isSystemAdmin,
    isLoading: isAdminLoading || isWorkspacesLoading,
    currentSlug,
    currentWorkspace,
    workspaces: workspaces ?? [],
    selectWorkspace,
  };
}
