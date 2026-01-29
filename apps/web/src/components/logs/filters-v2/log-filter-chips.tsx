"use client";

/**
 * Log Filter Chips Component
 *
 * Quick filter buttons for common log queries (Errors, Warnings, etc.)
 */

import { useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { LogQuickFilterPreset } from "@/lib/log-filter";

// ============================================================================
// Types
// ============================================================================

interface LogFilterChipsProps {
  /** Available quick filter presets */
  presets: readonly LogQuickFilterPreset[];
  /** Check if a preset is currently active */
  isPresetActive: (presetId: string) => boolean;
  /** Apply or toggle a preset */
  onPresetClick: (presetId: string) => void;
  className?: string;
}

// ============================================================================
// Component
// ============================================================================

export function LogFilterChips({
  presets,
  isPresetActive,
  onPresetClick,
  className,
}: LogFilterChipsProps) {
  const handleClick = useCallback(
    (presetId: string) => {
      onPresetClick(presetId);
    },
    [onPresetClick]
  );

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {presets.map((preset) => {
        const isActive = isPresetActive(preset.id);

        return (
          <button
            key={preset.id}
            type="button"
            onClick={() => handleClick(preset.id)}
            className="focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 rounded-full"
          >
            <Badge
              variant={isActive ? "default" : "outline"}
              className={cn(
                "cursor-pointer transition-colors text-xs h-6 px-2.5",
                isActive && preset.color === "destructive" && "bg-red-600 hover:bg-red-700",
                isActive && preset.color === "warning" && "bg-yellow-600 hover:bg-yellow-700",
                !isActive && "hover:bg-muted"
              )}
            >
              {preset.label}
            </Badge>
          </button>
        );
      })}
    </div>
  );
}

// ============================================================================
// Active Filter Pills Component
// ============================================================================

interface LogFilterPillsProps {
  predicates: Array<{
    type: string;
    label: string;
  }>;
  onRemove: (index: number) => void;
  onClearAll?: () => void;
  className?: string;
}

export function LogFilterPills({
  predicates,
  onRemove,
  onClearAll,
  className,
}: LogFilterPillsProps) {
  if (predicates.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {predicates.map((predicate, index) => (
        <Badge
          key={`${predicate.type}-${index}`}
          variant="secondary"
          className="gap-1 h-6 px-2 pr-1 text-xs"
        >
          <span className="max-w-[200px] truncate">{predicate.label}</span>
          <button
            type="button"
            onClick={() => onRemove(index)}
            className="ml-0.5 hover:bg-muted rounded p-0.5"
          >
            <svg
              className="h-3 w-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </Badge>
      ))}

      {predicates.length > 1 && onClearAll && (
        <button
          type="button"
          onClick={onClearAll}
          className="text-xs text-muted-foreground hover:text-foreground ml-1"
        >
          Clear all
        </button>
      )}
    </div>
  );
}
