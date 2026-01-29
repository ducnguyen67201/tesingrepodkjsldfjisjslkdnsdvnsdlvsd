"use client";

import { useState, useCallback } from "react";
import {
  FileCode,
  Plus,
  BarChart3,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePromptDetail } from "@/hooks/use-prompts";
import { CreateVersionDialog } from "./create-version-dialog";
import { VersionCard } from "./version-card";
import { PromptPlayground } from "./prompt-playground";
import { PromptAnalytics } from "./prompt-analytics";

export interface PromptDetailPanelProps {
  workspaceSlug: string;
  promptId: string;
  promptName: string;
}

export function PromptDetailPanel({
  workspaceSlug,
  promptId,
  promptName,
}: PromptDetailPanelProps) {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [playgroundVersionId, setPlaygroundVersionId] = useState<string | null>(
    null
  );

  const {
    prompt,
    isLoading,
    createVersion,
    setLabel,
    removeLabel,
    isCreatingVersion,
    isSettingLabel,
    isRemovingLabel,
  } = usePromptDetail({ workspaceSlug, promptId });

  const handleOpenPlayground = useCallback((versionId: string) => {
    setPlaygroundVersionId(versionId);
  }, []);

  const handleClosePlayground = useCallback(() => {
    setPlaygroundVersionId(null);
  }, []);

  const playgroundVersion = prompt?.versions.find(
    (v) => v.id === playgroundVersionId
  );

  type PromptVersion = NonNullable<typeof prompt>["versions"][number];

  const renderVersionCard = useCallback(
    (version: PromptVersion) => (
      <VersionCard
        key={version.id}
        id={version.id}
        version={version.version}
        type={version.type}
        content={version.content}
        variables={version.variables}
        labels={version.labels}
        createdAt={version.createdAt}
        onSetLabel={setLabel}
        onRemoveLabel={removeLabel}
        isSettingLabel={isSettingLabel}
        isRemovingLabel={isRemovingLabel}
        onPlayground={handleOpenPlayground}
      />
    ),
    [
      handleOpenPlayground,
      isRemovingLabel,
      isSettingLabel,
      removeLabel,
      setLabel,
    ]
  );

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-6 w-32" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
    );
  }

  if (!prompt) {
    return (
      <div className="flex-1 flex items-center justify-center text-center p-8">
        <div>
          <FileCode className="h-12 w-12 text-muted-foreground/30 mx-auto" />
          <p className="mt-4 text-sm text-muted-foreground">Prompt not found</p>
        </div>
      </div>
    );
  }

  const latestVersion = prompt.versions[0];

  return (
    <div className="flex flex-col h-full">
      {/* Row 1: Header - aligns with left panel header (h-[72px]) */}
      <div className="flex items-center justify-between h-[72px] px-4 border-b bg-background">
        <div>
          <h2 className="text-lg font-semibold">{promptName}</h2>
          <code className="text-xs text-muted-foreground mt-1 block">{prompt.slug}</code>
        </div>
        <Button size="sm" onClick={() => setIsCreateOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          New Version
        </Button>
      </div>

      {/* Row 2: Tabs - aligns with left panel search (h-[52px]) */}
      <Tabs defaultValue="versions" className="flex-1 flex flex-col">
        <div className="flex items-center h-[52px] px-4 border-b bg-background">
          <TabsList className="h-9">
            <TabsTrigger value="versions" className="h-8 gap-1.5 text-xs px-3">
              <Layers className="h-3.5 w-3.5" />
              Versions ({prompt.versions.length})
            </TabsTrigger>
            <TabsTrigger value="analytics" className="h-8 gap-1.5 text-xs px-3">
              <BarChart3 className="h-3.5 w-3.5" />
              Analytics
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Row 3: Description/metadata - aligns with left panel filters */}
        <div className="flex items-center h-[36px] px-4 border-b bg-muted/30">
          {prompt.description ? (
            <p className="text-xs text-muted-foreground truncate">
              {prompt.description}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground/50">
              No description
            </p>
          )}
        </div>

        <TabsContent value="versions" className="flex-1 mt-0 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-4 space-y-3">
              {prompt.versions.map(renderVersionCard)}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="analytics" className="flex-1 mt-0 overflow-auto p-4">
          <PromptAnalytics workspaceSlug={workspaceSlug} promptId={promptId} />
        </TabsContent>
      </Tabs>

      {/* Create version dialog */}
      {latestVersion && (
        <CreateVersionDialog
          open={isCreateOpen}
          onOpenChange={setIsCreateOpen}
          promptName={prompt.name}
          currentVersion={latestVersion.version}
          currentType={latestVersion.type}
          currentContent={latestVersion.content}
          onCreateVersion={createVersion}
          isCreating={isCreatingVersion}
        />
      )}

      {/* Playground dialog */}
      <Dialog
        open={!!playgroundVersionId}
        onOpenChange={(open) => !open && handleClosePlayground()}
      >
        <DialogContent className="max-w-4xl h-[80vh]">
          <DialogHeader>
            <DialogTitle>Prompt Playground</DialogTitle>
          </DialogHeader>
          {playgroundVersion && (
            <PromptPlayground
              workspaceSlug={workspaceSlug}
              promptId={promptId}
              versionId={playgroundVersion.id}
              promptName={prompt.name}
              version={playgroundVersion.version}
              type={playgroundVersion.type}
              content={playgroundVersion.content}
              config={playgroundVersion.config}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
