"use client";

/**
 * Filter Chips Component
 *
 * Displays active filter predicates as dismissible chips.
 * Each chip shows the field, operator, and value with a remove button.
 */

import { useCallback } from "react";
import { X, Search, Database, Globe, Cpu, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { OPERATOR_SYMBOLS, getFieldMeta } from "@/lib/trace-filter";
import type { FilterPredicate } from "@/hooks/use-trace-filters-v2";

// ============================================================================
// Types
// ============================================================================

interface FilterChipsProps {
  /** Active predicates to display */
  predicates: FilterPredicate[];
  /** Callback when a predicate is removed */
  onRemove: (index: number) => void;
  /** Callback to clear all filters */
  onClearAll?: () => void;
  /** Whether any filters are active */
  hasFilters: boolean;
  /** Additional class names */
  className?: string;
}

interface FilterChipProps {
  /** The predicate to display */
  predicate: FilterPredicate;
  /** Callback when chip is removed */
  onRemove: () => void;
  /** Index for aria-label */
  index: number;
}

// ============================================================================
// Filter Chip Component
// ============================================================================

function FilterChip({ predicate, onRemove, index }: FilterChipProps) {
  const handleRemove = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onRemove();
    },
    [onRemove]
  );

  // Get icon based on predicate type/category
  const getIcon = () => {
    if (predicate.type === "search") {
      return <Search className="h-3 w-3" />;
    }

    if (predicate.field) {
      const meta = getFieldMeta(predicate.field);
      if (meta) {
        switch (meta.category) {
          case "database":
            return <Database className="h-3 w-3" />;
          case "http":
            return <Globe className="h-3 w-3" />;
          case "genai":
            return <Cpu className="h-3 w-3" />;
          case "exception":
            return <AlertTriangle className="h-3 w-3" />;
        }
      }
    }

    return null;
  };

  // Format display value
  const formatValue = (value: unknown): string => {
    if (value === undefined || value === null) return "";
    if (Array.isArray(value)) {
      return value.map(String).join(", ");
    }
    if (typeof value === "boolean") {
      return value ? "true" : "false";
    }
    return String(value);
  };

  // Get display label for the field
  const getFieldLabel = (): string => {
    if (predicate.type === "search") {
      return "search";
    }
    if (predicate.field) {
      const meta = getFieldMeta(predicate.field);
      if (meta) return meta.label;
      // For dynamic attributes, just show the field name
      return predicate.field.replace(/^(trace|span)\./, "");
    }
    if (predicate.attributeKey) {
      return predicate.attributeKey;
    }
    return "filter";
  };

  // Get operator symbol
  const getOperatorSymbol = (): string => {
    if (predicate.type === "search") return ":";
    if (predicate.op) {
      return OPERATOR_SYMBOLS[predicate.op] ?? predicate.op;
    }
    return "=";
  };

  // Get display value
  const getDisplayValue = (): string => {
    if (predicate.type === "search" && predicate.query) {
      return `"${predicate.query}"`;
    }
    return formatValue(predicate.value);
  };

  const icon = getIcon();
  const fieldLabel = getFieldLabel();
  const operator = getOperatorSymbol();
  const displayValue = getDisplayValue();

  return (
    <Badge
      variant="secondary"
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 text-xs font-normal",
        "bg-muted/50 hover:bg-muted border border-border/50",
        "transition-colors"
      )}
    >
      {icon && <span className="text-muted-foreground">{icon}</span>}
      <span className="font-medium text-foreground/80">{fieldLabel}</span>
      <span className="text-muted-foreground">{operator}</span>
      <span className="text-foreground truncate max-w-[150px]">{displayValue}</span>
      <button
        type="button"
        onClick={handleRemove}
        className={cn(
          "ml-0.5 rounded-sm p-0.5",
          "text-muted-foreground hover:text-foreground hover:bg-muted-foreground/20",
          "transition-colors focus:outline-none focus:ring-1 focus:ring-ring"
        )}
        aria-label={`Remove filter ${index + 1}: ${fieldLabel}`}
      >
        <X className="h-3 w-3" />
      </button>
    </Badge>
  );
}

// ============================================================================
// Filter Chips Bar Component
// ============================================================================

export function FilterChips({
  predicates,
  onRemove,
  onClearAll,
  hasFilters,
  className,
}: FilterChipsProps) {
  const handleRemove = useCallback(
    (index: number) => () => {
      onRemove(index);
    },
    [onRemove]
  );

  if (!hasFilters || predicates.length === 0) {
    return null;
  }

  // Generate a unique key for each predicate
  const getPredicateKey = (predicate: FilterPredicate, index: number): string => {
    const parts = [predicate.type, index.toString()];
    if (predicate.field) parts.push(predicate.field);
    if (predicate.op) parts.push(predicate.op);
    if (predicate.query) parts.push(predicate.query);
    if (predicate.value !== undefined) parts.push(String(predicate.value));
    return parts.join("-");
  };

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {predicates.map((predicate, index) => (
        <FilterChip
          key={getPredicateKey(predicate, index)}
          predicate={predicate}
          onRemove={handleRemove(index)}
          index={index}
        />
      ))}

      {predicates.length > 0 && onClearAll && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearAll}
          className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <X className="mr-1 h-3 w-3" />
          Clear all
        </Button>
      )}
    </div>
  );
}

// ============================================================================
// Quick Filter Chips Component
// ============================================================================

interface QuickFilterChipsProps {
  /** Available quick filter presets */
  presets: readonly { id: string; label: string; description: string }[];
  /** Check if a preset is active */
  isActive: (id: string) => boolean;
  /** Apply a preset */
  onApply: (id: string) => void;
  /** Additional class names */
  className?: string;
}

export function QuickFilterChips({
  presets,
  isActive,
  onApply,
  className,
}: QuickFilterChipsProps) {
  const handleClick = useCallback(
    (id: string) => () => {
      onApply(id);
    },
    [onApply]
  );

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {presets.map((preset) => {
        const active = isActive(preset.id);
        return (
          <Button
            key={preset.id}
            variant={active ? "default" : "outline"}
            size="sm"
            onClick={handleClick(preset.id)}
            className={cn(
              "h-7 text-xs",
              active && "bg-primary text-primary-foreground"
            )}
            title={preset.description}
          >
            {preset.label}
          </Button>
        );
      })}
    </div>
  );
}
