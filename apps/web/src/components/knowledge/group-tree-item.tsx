"use client";

import { useCallback } from "react";
import { Folder, ChevronRight, ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface GroupTreeItemProps {
  group: { id: string; name: string; parentId: string | null };
  groups: Array<{ id: string; name: string; parentId: string | null }>;
  articles: Array<{ id: string; groupId: string | null }>;
  selectedGroupId: string | null;
  expandedGroups: Set<string>;
  onSelect: (groupId: string) => void;
  onToggle: (groupId: string) => void;
  level?: number;
}

export function GroupTreeItem({
  group,
  groups,
  articles,
  selectedGroupId,
  expandedGroups,
  onSelect,
  onToggle,
  level = 0,
}: GroupTreeItemProps) {
  const children = groups.filter((g) => g.parentId === group.id);
  const hasChildren = children.length > 0;
  const isExpanded = expandedGroups.has(group.id);
  const isSelected = selectedGroupId === group.id;
  const articleCount = articles.filter((a) => a.groupId === group.id).length;

  const handleToggleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onToggle(group.id);
    },
    [onToggle, group.id]
  );

  const handleSelectClick = useCallback(() => {
    onSelect(group.id);
  }, [onSelect, group.id]);

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        className={cn(
          "flex items-center gap-1 w-full px-2 py-1.5 rounded-md text-sm text-left hover:bg-muted cursor-pointer",
          isSelected && "bg-muted font-medium"
        )}
        style={{ paddingLeft: `${8 + level * 16}px` }}
        onClick={handleSelectClick}
        onKeyDown={(e) => e.key === "Enter" && handleSelectClick()}
      >
        {hasChildren ? (
          <span
            role="button"
            tabIndex={0}
            className="p-0.5 hover:bg-muted-foreground/20 rounded"
            onClick={handleToggleClick}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.stopPropagation();
                onToggle(group.id);
              }
            }}
          >
            {isExpanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </span>
        ) : (
          <span className="w-4" />
        )}
        <Folder className="h-4 w-4 text-muted-foreground" />
        <span className="flex-1 truncate">{group.name}</span>
        {articleCount > 0 && (
          <Badge variant="secondary" className="text-[10px] px-1.5">
            {articleCount}
          </Badge>
        )}
      </div>

      {hasChildren && isExpanded && (
        <div>
          {children.map((child) => (
            <GroupTreeItem
              key={child.id}
              group={child}
              groups={groups}
              articles={articles}
              selectedGroupId={selectedGroupId}
              expandedGroups={expandedGroups}
              onSelect={onSelect}
              onToggle={onToggle}
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
