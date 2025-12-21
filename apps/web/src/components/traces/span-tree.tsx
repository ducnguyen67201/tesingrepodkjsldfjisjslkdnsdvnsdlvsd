"use client";

import { useState, useCallback, useMemo } from "react";
import { ChevronRight, ChevronDown, AlertCircle, Coins, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { formatDuration, formatTokens, formatCost } from "@/lib/format";
import { type SpanType } from "@cognobserve/api/schemas";

// ------------------------------------------------------------
// Types
// ------------------------------------------------------------

interface SpanWithType {
  id: string;
  externalSpanId: string;
  parentSpanId: string | null;
  name: string;
  kind: string;
  statusCode: string;
  statusMessage: string | null;
  startTime: Date;
  endTime: Date | null;
  durationMs: number | null;
  attributes: unknown;
  events: unknown;
  libraryName: string | null;
  libraryVersion: string | null;
  model: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  totalCost: number | null;
  type: SpanType;
}

interface SpanNode extends SpanWithType {
  children: SpanNode[];
  depth: number;
}

interface SpanTreeProps {
  spans: SpanWithType[];
}

// ------------------------------------------------------------
// Constants
// ------------------------------------------------------------

const SPAN_TYPE_STYLES: Record<
  SpanType,
  { bg: string; text: string; border: string }
> = {
  LLM: {
    bg: "bg-purple-50 dark:bg-purple-950/30",
    text: "text-purple-700 dark:text-purple-300",
    border: "border-purple-200 dark:border-purple-800",
  },
  HTTP: {
    bg: "bg-blue-50 dark:bg-blue-950/30",
    text: "text-blue-700 dark:text-blue-300",
    border: "border-blue-200 dark:border-blue-800",
  },
  DB: {
    bg: "bg-green-50 dark:bg-green-950/30",
    text: "text-green-700 dark:text-green-300",
    border: "border-green-200 dark:border-green-800",
  },
  FUNCTION: {
    bg: "bg-orange-50 dark:bg-orange-950/30",
    text: "text-orange-700 dark:text-orange-300",
    border: "border-orange-200 dark:border-orange-800",
  },
  LOG: {
    bg: "bg-gray-50 dark:bg-gray-950/30",
    text: "text-gray-700 dark:text-gray-300",
    border: "border-gray-200 dark:border-gray-800",
  },
  CUSTOM: {
    bg: "bg-slate-50 dark:bg-slate-950/30",
    text: "text-slate-700 dark:text-slate-300",
    border: "border-slate-200 dark:border-slate-800",
  },
};

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

/**
 * Build tree structure from flat span list.
 */
const buildSpanTree = (spans: SpanWithType[]): SpanNode[] => {
  const spanMap = new Map<string, SpanNode>();
  const roots: SpanNode[] = [];

  // First pass: create nodes
  for (const span of spans) {
    spanMap.set(span.externalSpanId, {
      ...span,
      children: [],
      depth: 0,
    });
  }

  // Second pass: build tree
  for (const span of spans) {
    const node = spanMap.get(span.externalSpanId)!;
    if (span.parentSpanId && spanMap.has(span.parentSpanId)) {
      const parent = spanMap.get(span.parentSpanId)!;
      node.depth = parent.depth + 1;
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Sort children by start time
  const sortChildren = (nodes: SpanNode[]) => {
    nodes.sort(
      (a, b) =>
        new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    );
    for (const node of nodes) {
      sortChildren(node.children);
    }
  };

  sortChildren(roots);
  return roots;
};

// ------------------------------------------------------------
// Span Node Component
// ------------------------------------------------------------

interface SpanNodeProps {
  node: SpanNode;
  isExpanded: boolean;
  onToggle: (id: string) => void;
}

function SpanNodeItem({ node, isExpanded, onToggle }: SpanNodeProps) {
  const hasChildren = node.children.length > 0;
  const isError = node.statusCode === "ERROR";
  const typeStyle = SPAN_TYPE_STYLES[node.type];

  return (
    <Collapsible open={isExpanded} onOpenChange={() => onToggle(node.id)}>
      <div
        className={cn(
          "rounded-lg border transition-colors",
          isError
            ? "border-destructive/30 bg-destructive/5"
            : "border-border hover:border-muted-foreground/30"
        )}
      >
        {/* Span Header */}
        <CollapsibleTrigger asChild>
          <button className="flex w-full items-center gap-2 p-3 text-left">
            {/* Expand/Collapse Icon */}
            <div className="flex h-5 w-5 shrink-0 items-center justify-center">
              {hasChildren ? (
                isExpanded ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )
              ) : (
                <div className="h-1 w-1 rounded-full bg-muted-foreground/30" />
              )}
            </div>

            {/* Span Name */}
            <span
              className={cn(
                "flex-1 truncate font-medium",
                isError && "text-destructive"
              )}
            >
              {node.name}
            </span>

            {/* Type Badge */}
            <Badge
              variant="secondary"
              className={cn(
                "shrink-0 text-xs font-normal",
                typeStyle.bg,
                typeStyle.text
              )}
            >
              {node.type}
            </Badge>

            {/* Duration */}
            <span className="shrink-0 font-mono text-xs text-muted-foreground">
              {formatDuration(node.durationMs)}
            </span>

            {/* Error Icon */}
            {isError && (
              <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
            )}
          </button>
        </CollapsibleTrigger>

        {/* Expanded Content */}
        <CollapsibleContent>
          <div className="border-t px-3 py-2 space-y-2">
            {/* LLM Details */}
            {node.type === "LLM" && node.model && (
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Zap className="h-3.5 w-3.5" />
                  <span className="font-mono">{node.model}</span>
                </div>
                {node.totalTokens && (
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <span>{formatTokens(node.totalTokens)} tokens</span>
                    {node.promptTokens && node.completionTokens && (
                      <span className="text-muted-foreground/60">
                        ({formatTokens(node.promptTokens)} in / {formatTokens(node.completionTokens)} out)
                      </span>
                    )}
                  </div>
                )}
                {node.totalCost !== null && node.totalCost > 0 && (
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Coins className="h-3.5 w-3.5" />
                    <span>{formatCost(node.totalCost)}</span>
                  </div>
                )}
              </div>
            )}

            {/* Error Message */}
            {isError && node.statusMessage && (
              <div className="rounded-md bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
                {node.statusMessage}
              </div>
            )}

            {/* Span ID */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Span ID:</span>
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                {node.externalSpanId}
              </code>
            </div>

            {/* Kind */}
            {node.kind !== "INTERNAL" && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Kind:</span>
                <span>{node.kind}</span>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div className="ml-5 mt-1 space-y-1 border-l-2 border-muted pl-3">
          {node.children.map((child) => (
            <SpanNodeWrapper key={child.id} node={child} onToggle={onToggle} />
          ))}
        </div>
      )}
    </Collapsible>
  );
}

// Wrapper to manage expanded state at parent level
interface SpanNodeWrapperProps {
  node: SpanNode;
  onToggle: (id: string) => void;
  expandedIds?: Set<string>;
}

function SpanNodeWrapper({ node, onToggle }: SpanNodeWrapperProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  const handleToggle = useCallback((id: string) => {
    if (id === node.id) {
      setIsExpanded((prev) => !prev);
    }
    onToggle(id);
  }, [node.id, onToggle]);

  return (
    <SpanNodeItem
      node={node}
      isExpanded={isExpanded}
      onToggle={handleToggle}
    />
  );
}

// ------------------------------------------------------------
// Main Component
// ------------------------------------------------------------

export function SpanTree({ spans }: SpanTreeProps) {
  const tree = useMemo(() => buildSpanTree(spans), [spans]);

  // No-op: individual nodes manage their own expanded state via SpanNodeWrapper.
  // This callback exists to satisfy the prop type; future: could track globally.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleToggle = useCallback((_id: string) => {}, []);

  if (spans.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <p className="text-sm text-muted-foreground">No spans in this trace</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {tree.map((node) => (
        <SpanNodeWrapper key={node.id} node={node} onToggle={handleToggle} />
      ))}
    </div>
  );
}
