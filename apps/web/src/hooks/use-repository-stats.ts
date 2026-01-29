"use client";

import { trpc } from "@/lib/trpc/client";

/**
 * Hook for fetching repository indexing statistics.
 *
 * @param workspaceSlug - The workspace slug
 * @param repositoryId - The repository ID to fetch stats for
 * @param enabled - Whether to enable the query (default: true)
 */
export function useRepositoryStats(
  workspaceSlug: string,
  repositoryId: string | null,
  enabled: boolean = true
) {
  const { data, isLoading, error, refetch } = trpc.github.getRepositoryStats.useQuery(
    {
      workspaceSlug,
      repositoryId: repositoryId ?? "",
    },
    {
      enabled: enabled && !!repositoryId,
    }
  );

  return {
    stats: data,
    isLoading,
    error,
    refetch,
  };
}

/**
 * Language color map for visual display
 */
export const LANGUAGE_COLORS: Record<string, string> = {
  TypeScript: "bg-blue-500",
  JavaScript: "bg-yellow-500",
  Python: "bg-green-500",
  Go: "bg-cyan-500",
  Rust: "bg-orange-500",
  Java: "bg-red-500",
  Ruby: "bg-red-400",
  PHP: "bg-purple-500",
  "C#": "bg-violet-500",
  "C++": "bg-pink-500",
  C: "bg-gray-500",
  Swift: "bg-orange-400",
  Kotlin: "bg-purple-400",
  Scala: "bg-red-300",
  HTML: "bg-orange-600",
  CSS: "bg-blue-400",
  SCSS: "bg-pink-400",
  JSON: "bg-gray-400",
  YAML: "bg-gray-500",
  Markdown: "bg-gray-600",
  Unknown: "bg-gray-400",
};

const DEFAULT_LANGUAGE_COLOR = "bg-gray-400";

/**
 * Get color class for a language
 */
export function getLanguageColor(language: string): string {
  return LANGUAGE_COLORS[language] ?? DEFAULT_LANGUAGE_COLOR;
}
