"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc/client";

// ============================================================
// Types
// ============================================================

interface PromptVersionSelectorProps {
  workspaceSlug: string;
  projectId: string;
  label: string;
  selectedVersionId: string;
  onVersionSelect: (versionId: string) => void;
  disabled?: boolean;
}

interface PromptOption {
  id: string;
  name: string;
  slug: string;
  latestVersionId?: string;
}

// ============================================================
// Component
// ============================================================

export function PromptVersionSelector({
  workspaceSlug,
  projectId,
  label,
  selectedVersionId,
  onVersionSelect,
  disabled = false,
}: PromptVersionSelectorProps) {
  // Track selected prompt ID as separate state
  const [selectedPromptId, setSelectedPromptId] = useState("");

  // Fetch prompts for this project
  const { data: promptsData, isLoading: isLoadingPrompts } = trpc.prompts.list.useQuery(
    { workspaceSlug, projectId, limit: 100 },
    { staleTime: 30_000 }
  );

  const prompts: PromptOption[] = useMemo(() => {
    return promptsData?.items ?? [];
  }, [promptsData]);

  // Fetch versions for selected prompt
  const { data: promptDetail, isLoading: isLoadingVersions } = trpc.prompts.get.useQuery(
    { workspaceSlug, promptId: selectedPromptId },
    { enabled: !!selectedPromptId, staleTime: 30_000 }
  );

  const versions = useMemo(() => {
    return promptDetail?.versions ?? [];
  }, [promptDetail]);

  // Sync selectedPromptId when selectedVersionId changes externally (e.g., on reset)
  useEffect(() => {
    if (!selectedVersionId) {
      setSelectedPromptId("");
    }
  }, [selectedVersionId]);

  // Handlers
  const handlePromptChange = useCallback(
    (promptId: string) => {
      setSelectedPromptId(promptId);
      const prompt = prompts.find((p) => p.id === promptId);
      if (prompt?.latestVersionId) {
        onVersionSelect(prompt.latestVersionId);
      }
    },
    [prompts, onVersionSelect]
  );

  const handleVersionChange = useCallback(
    (versionId: string) => {
      onVersionSelect(versionId);
    },
    [onVersionSelect]
  );

  // Render
  return (
    <div className="space-y-3">
      <Label>{label}</Label>

      {/* Prompt Selector */}
      <Select
        value={selectedPromptId}
        onValueChange={handlePromptChange}
        disabled={disabled || isLoadingPrompts}
      >
        <SelectTrigger>
          {isLoadingPrompts ? (
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Loading prompts...</span>
            </div>
          ) : (
            <SelectValue placeholder="Select a prompt" />
          )}
        </SelectTrigger>
        <SelectContent>
          {prompts.map((prompt) => (
            <SelectItem key={prompt.id} value={prompt.id}>
              {prompt.name} ({prompt.slug})
            </SelectItem>
          ))}
          {prompts.length === 0 && !isLoadingPrompts && (
            <div className="px-2 py-1.5 text-sm text-muted-foreground">
              No prompts available
            </div>
          )}
        </SelectContent>
      </Select>

      {/* Version Selector - only show when prompt is selected */}
      {selectedPromptId && (
        <Select
          value={selectedVersionId}
          onValueChange={handleVersionChange}
          disabled={disabled || isLoadingVersions}
        >
          <SelectTrigger>
            {isLoadingVersions ? (
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Loading versions...</span>
              </div>
            ) : (
              <SelectValue placeholder="Select a version" />
            )}
          </SelectTrigger>
          <SelectContent>
            {versions.map((version) => (
              <SelectItem key={version.id} value={version.id}>
                v{version.version} - {version.type}
                {version.labels?.length > 0 && ` (${version.labels.join(", ")})`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
