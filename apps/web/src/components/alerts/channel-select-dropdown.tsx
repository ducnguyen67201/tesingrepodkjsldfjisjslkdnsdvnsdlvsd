"use client";

import { useState, useCallback } from "react";
import { ChevronDown, ChevronUp, Check, Bell, Settings, ExternalLink } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  CHANNEL_PROVIDER_ICONS,
} from "@ducsigr/api/schemas";

interface Channel {
  id: string;
  name: string;
  provider: string;
}

interface ChannelSelectDropdownProps {
  channels: Channel[];
  selectedIds: Set<string>;
  onToggle: (channelId: string) => void;
  workspaceSlug: string;
  isLoading?: boolean;
}

export function ChannelSelectDropdown({
  channels,
  selectedIds,
  onToggle,
  workspaceSlug,
  isLoading,
}: ChannelSelectDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleToggle = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  const handleChannelClick = useCallback(
    (channelId: string) => {
      onToggle(channelId);
    },
    [onToggle]
  );

  const selectedCount = selectedIds.size;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          onClick={handleToggle}
          className={cn(
            "flex items-center justify-between w-full px-4 py-3 rounded-lg border bg-card",
            "hover:bg-muted/50 transition-colors",
            isOpen && "rounded-b-none border-b-0"
          )}
        >
          <div className="flex items-center gap-3">
            <Bell className="h-5 w-5 text-muted-foreground" />
            <span className="font-medium">Notify via</span>
            {selectedCount > 0 && (
              <Badge variant="default" className="h-5 min-w-5 px-1.5 text-xs">
                {selectedCount}
              </Badge>
            )}
          </div>
          {isOpen ? (
            <ChevronUp className="h-5 w-5 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-5 w-5 text-muted-foreground" />
          )}
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="border border-t-0 rounded-b-lg bg-card overflow-hidden">
          {isLoading ? (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              Loading channels...
            </div>
          ) : channels.length > 0 ? (
            <div className="py-1">
              {channels.map((channel) => {
                const isSelected = selectedIds.has(channel.id);
                const icon = CHANNEL_PROVIDER_ICONS[channel.provider as keyof typeof CHANNEL_PROVIDER_ICONS] ?? "🔔";
                return (
                  <ChannelOption
                    key={channel.id}
                    icon={icon}
                    name={channel.name}
                    isSelected={isSelected}
                    onClick={() => handleChannelClick(channel.id)}
                  />
                );
              })}
            </div>
          ) : (
            <div className="px-4 py-6 text-center">
              <p className="text-sm text-muted-foreground mb-3">
                No channels configured
              </p>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/workspace/${workspaceSlug}/settings/channels`}>
                  <Settings className="mr-2 h-4 w-4" />
                  Configure Channels
                  <ExternalLink className="ml-2 h-3 w-3" />
                </Link>
              </Button>
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

interface ChannelOptionProps {
  icon: string;
  name: string;
  isSelected: boolean;
  onClick: () => void;
}

function ChannelOption({ icon, name, isSelected, onClick }: ChannelOptionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 w-full px-4 py-2.5 text-left",
        "hover:bg-muted/50 transition-colors",
        isSelected && "bg-primary/5"
      )}
    >
      <span className="text-lg">{icon}</span>
      <span
        className={cn(
          "flex-1 text-sm",
          isSelected ? "text-primary font-medium" : "text-muted-foreground"
        )}
      >
        {name}
      </span>
      <div
        className={cn(
          "flex items-center justify-center w-5 h-5 rounded-full border-2 transition-all",
          isSelected
            ? "bg-primary border-primary text-primary-foreground"
            : "border-muted-foreground/30"
        )}
      >
        {isSelected && <Check className="w-3 h-3" />}
      </div>
    </button>
  );
}
