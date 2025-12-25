"use client";

import { formatDistanceToNow } from "date-fns";
import {
  MoreHorizontal,
  Tag,
  Rocket,
  FlaskConical,
  Clock,
  MessageSquare,
  FileText,
  ChevronDown,
  ChevronUp,
  Play,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useState, useCallback } from "react";

interface VersionCardProps {
  id: string;
  version: number;
  type: "text" | "chat";
  content:
    | { type: "text"; text: string }
    | { type: "chat"; messages: Array<{ role: string; content: string; name?: string }> };
  labels: string[];
  createdAt: Date;
  onSetLabel: (versionId: string, label: "production" | "staging" | "latest") => Promise<unknown>;
  onRemoveLabel?: (label: "production" | "staging") => Promise<unknown>;
  isSettingLabel: boolean;
  isRemovingLabel?: boolean;
  onPlayground?: (versionId: string) => void;
}

export function VersionCard({
  id,
  version,
  type,
  content,
  labels,
  createdAt,
  onSetLabel,
  onRemoveLabel,
  isSettingLabel,
  isRemovingLabel,
  onPlayground,
}: VersionCardProps) {
  const [isOpen, setIsOpen] = useState(false);

  const isProduction = labels.includes("production");
  const isStaging = labels.includes("staging");
  const isLatest = labels.includes("latest");

  const handleSetProduction = useCallback(async () => {
    await onSetLabel(id, "production");
  }, [id, onSetLabel]);

  const handleSetStaging = useCallback(async () => {
    await onSetLabel(id, "staging");
  }, [id, onSetLabel]);

  const handleRemoveProduction = useCallback(async () => {
    await onRemoveLabel?.("production");
  }, [onRemoveLabel]);

  const handleRemoveStaging = useCallback(async () => {
    await onRemoveLabel?.("staging");
  }, [onRemoveLabel]);

  const handlePlayground = useCallback(() => {
    onPlayground?.(id);
  }, [id, onPlayground]);

  const TypeIcon = type === "chat" ? MessageSquare : FileText;

  const getContentPreview = (): string => {
    if (content.type === "text") {
      return content.text.slice(0, 150) + (content.text.length > 150 ? "..." : "");
    }
    const firstMessage = content.messages[0];
    if (firstMessage) {
      return `${firstMessage.role}: ${firstMessage.content.slice(0, 100)}${firstMessage.content.length > 100 ? "..." : ""}`;
    }
    return "";
  };

  const renderFullContent = () => {
    if (content.type === "text") {
      return (
        <pre className="whitespace-pre-wrap text-xs font-mono bg-muted/50 p-3 rounded-md overflow-x-auto">
          {content.text}
        </pre>
      );
    }

    return (
      <div className="space-y-2">
        {content.messages.map((msg, idx) => (
          <div key={idx} className="bg-muted/50 p-2 rounded-md">
            <Badge variant="outline" className="text-[10px] mb-1">
              {msg.role}
            </Badge>
            <pre className="whitespace-pre-wrap text-xs font-mono mt-1">
              {msg.content}
            </pre>
          </div>
        ))}
      </div>
    );
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="rounded-lg border p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {/* Header */}
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="secondary" className="text-xs px-2 py-0.5">
                v{version}
              </Badge>
              <TypeIcon className="h-3.5 w-3.5 text-muted-foreground" />
              {isProduction && (
                <Badge className="bg-green-100 text-green-800 hover:bg-green-100 text-[10px] px-1.5 py-0 gap-1">
                  <Rocket className="h-2.5 w-2.5" />
                  production
                </Badge>
              )}
              {isStaging && (
                <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100 text-[10px] px-1.5 py-0 gap-1">
                  <FlaskConical className="h-2.5 w-2.5" />
                  staging
                </Badge>
              )}
              {isLatest && (
                <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100 text-[10px] px-1.5 py-0 gap-1">
                  <Clock className="h-2.5 w-2.5" />
                  latest
                </Badge>
              )}
            </div>

            {/* Preview */}
            <p className="text-xs text-muted-foreground mt-2 font-mono line-clamp-2">
              {getContentPreview()}
            </p>

            {/* Created time */}
            <p className="text-[10px] text-muted-foreground mt-2">
              Created {formatDistanceToNow(new Date(createdAt), { addSuffix: true })}
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                {isOpen ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            </CollapsibleTrigger>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {onPlayground && (
                  <>
                    <DropdownMenuItem onClick={handlePlayground}>
                      <Play className="mr-2 h-4 w-4" />
                      Test in Playground
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem
                  onClick={handleSetProduction}
                  disabled={isSettingLabel || isRemovingLabel || isProduction}
                >
                  <Rocket className="mr-2 h-4 w-4" />
                  Set as Production
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={handleSetStaging}
                  disabled={isSettingLabel || isRemovingLabel || isStaging}
                >
                  <FlaskConical className="mr-2 h-4 w-4" />
                  Set as Staging
                </DropdownMenuItem>
                {(isProduction || isStaging) && onRemoveLabel && (
                  <>
                    <DropdownMenuSeparator />
                    {isProduction && (
                      <DropdownMenuItem
                        onClick={handleRemoveProduction}
                        disabled={isSettingLabel || isRemovingLabel}
                        className="text-destructive focus:text-destructive"
                      >
                        <X className="mr-2 h-4 w-4" />
                        Remove Production
                      </DropdownMenuItem>
                    )}
                    {isStaging && (
                      <DropdownMenuItem
                        onClick={handleRemoveStaging}
                        disabled={isSettingLabel || isRemovingLabel}
                        className="text-destructive focus:text-destructive"
                      >
                        <X className="mr-2 h-4 w-4" />
                        Remove Staging
                      </DropdownMenuItem>
                    )}
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled>
                  <Tag className="mr-2 h-4 w-4" />
                  Compare with...
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Expanded content */}
        <CollapsibleContent className="mt-4">
          {renderFullContent()}
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
