"use client";

import { useMemo, useCallback } from "react";
import {
  FileCode2,
  Boxes,
  Code2,
  Clock,
  ExternalLink,
  Loader2,
  Lock,
  FolderTree,
} from "lucide-react";
import { GitHubIcon } from "@/components/icons";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useRepositoryStats, getLanguageColor } from "@/hooks/use-repository-stats";
import { cn } from "@/lib/utils";

interface RepositoryStatsSheetProps {
  workspaceSlug: string;
  repositoryId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Format a number with commas for display
 */
function formatNumber(num: number): string {
  return new Intl.NumberFormat().format(num);
}

/**
 * Format a date as a relative time string
 */
function formatRelativeTime(date: Date | string | null): string {
  if (!date) return "Never";

  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes === 1 ? "" : "s"} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;

  return then.toLocaleDateString();
}

/**
 * Stats Card Component
 */
function StatsCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border bg-card p-3">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <span className="text-xl font-bold">{value}</span>
    </div>
  );
}

/**
 * Language Bar Component
 */
function LanguageBar({
  language,
  count,
  percentage,
  maxPercentage,
}: {
  language: string;
  count: number;
  percentage: number;
  maxPercentage: number;
}) {
  const width = maxPercentage > 0 ? (percentage / maxPercentage) * 100 : 0;

  return (
    <div className="flex items-center gap-3">
      <div className="flex w-24 items-center gap-2">
        <div className={cn("h-2.5 w-2.5 rounded-full", getLanguageColor(language))} />
        <span className="text-sm font-medium truncate">{language}</span>
      </div>
      <div className="flex-1">
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all", getLanguageColor(language))}
            style={{ width: `${width}%` }}
          />
        </div>
      </div>
      <div className="flex items-center gap-2 text-right">
        <span className="text-sm text-muted-foreground w-12">{percentage}%</span>
        <span className="text-xs text-muted-foreground w-16">{formatNumber(count)} chunks</span>
      </div>
    </div>
  );
}

/**
 * File Row Component
 */
function FileRow({
  filePath,
  language,
  chunkCount,
  totalLines,
}: {
  filePath: string;
  language: string;
  chunkCount: number;
  totalLines: number;
}) {
  const fileName = filePath.split("/").pop() ?? filePath;
  const dirPath = filePath.split("/").slice(0, -1).join("/");

  return (
    <div className="flex items-center justify-between py-2 px-1 hover:bg-muted/50 rounded-sm">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <FileCode2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-sm truncate">{fileName}</span>
            <div className={cn("h-2 w-2 rounded-full flex-shrink-0", getLanguageColor(language))} />
          </div>
          {dirPath && (
            <span className="text-xs text-muted-foreground truncate block">{dirPath}</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0 ml-2">
        <Badge variant="secondary" className="text-xs">
          {chunkCount} chunks
        </Badge>
        <span className="text-xs text-muted-foreground">{formatNumber(totalLines)} lines</span>
      </div>
    </div>
  );
}

/**
 * Repository Stats Sheet
 *
 * Displays comprehensive statistics for an indexed repository
 */
export function RepositoryStatsSheet({
  workspaceSlug,
  repositoryId,
  open,
  onOpenChange,
}: RepositoryStatsSheetProps) {
  const { stats, isLoading } = useRepositoryStats(workspaceSlug, repositoryId, open);

  const maxLanguagePercentage = useMemo(() => {
    if (!stats?.languageBreakdown) return 0;
    return Math.max(...stats.languageBreakdown.map((l) => l.percentage));
  }, [stats?.languageBreakdown]);

  const handleViewOnGitHub = useCallback(() => {
    if (!stats?.repository) return;
    window.open(
      `https://github.com/${stats.repository.fullName}`,
      "_blank",
      "noopener,noreferrer"
    );
  }, [stats?.repository]);

  const renderLanguageItem = useCallback(
    (item: { language: string; count: number; percentage: number }) => (
      <LanguageBar
        key={item.language}
        language={item.language}
        count={item.count}
        percentage={item.percentage}
        maxPercentage={maxLanguagePercentage}
      />
    ),
    [maxLanguagePercentage]
  );

  const renderFileItem = useCallback(
    (file: { filePath: string; language: string; chunkCount: number; totalLines: number }) => (
      <FileRow
        key={file.filePath}
        filePath={file.filePath}
        language={file.language}
        chunkCount={file.chunkCount}
        totalLines={file.totalLines}
      />
    ),
    []
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg p-0 flex flex-col">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : !stats ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-muted-foreground">Repository not found</p>
          </div>
        ) : (
          <>
            <SheetHeader className="p-6 pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                  <GitHubIcon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <SheetTitle className="truncate">
                      {stats.repository.fullName}
                    </SheetTitle>
                    {stats.repository.isPrivate && (
                      <Lock className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    )}
                  </div>
                  <SheetDescription className="flex items-center gap-2">
                    <Clock className="h-3 w-3" />
                    Indexed {formatRelativeTime(stats.overview.lastIndexedAt)}
                  </SheetDescription>
                </div>
              </div>
            </SheetHeader>

            <ScrollArea className="flex-1">
              <div className="p-6 pt-2 space-y-6">
                {/* Overview Stats */}
                <div className="grid grid-cols-3 gap-3">
                  <StatsCard
                    icon={FileCode2}
                    label="Files"
                    value={formatNumber(stats.overview.totalFiles)}
                  />
                  <StatsCard
                    icon={Boxes}
                    label="Chunks"
                    value={formatNumber(stats.overview.totalChunks)}
                  />
                  <StatsCard
                    icon={Code2}
                    label="Lines"
                    value={formatNumber(stats.overview.totalLines)}
                  />
                </div>

                <Separator />

                {/* Language Breakdown */}
                {stats.languageBreakdown.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      <Code2 className="h-4 w-4" />
                      Language Breakdown
                    </h3>
                    <div className="space-y-2">
                      {stats.languageBreakdown.map(renderLanguageItem)}
                    </div>
                  </div>
                )}

                <Separator />

                {/* Top Files */}
                {stats.topFiles.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      <FolderTree className="h-4 w-4" />
                      Top Files by Chunks
                    </h3>
                    <div className="space-y-0.5">
                      {stats.topFiles.map(renderFileItem)}
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>

            {/* Footer */}
            <div className="p-4 border-t mt-auto">
              <Button
                variant="outline"
                className="w-full"
                onClick={handleViewOnGitHub}
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                View on GitHub
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
