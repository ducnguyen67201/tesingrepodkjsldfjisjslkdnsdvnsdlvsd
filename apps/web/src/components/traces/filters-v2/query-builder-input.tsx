"use client";

/**
 * Query Builder Input Component v2
 *
 * Inline autocomplete search with syntax: field=value AND field2=value2
 * - Type partial field names to see suggestions (e.g., "ser" → "service.name")
 * - Use = as separator between field and value
 * - Support AND/OR operators between conditions
 * - Press Cmd+Enter (Mac) / Ctrl+Enter (Windows) to execute search
 */

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { Search, X, Play, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useFilterAutocomplete } from "@/hooks/use-filter-autocomplete";
import type { FilterField } from "@cognobserve/api/schemas";

// ============================================================================
// Types
// ============================================================================

interface QueryBuilderInputProps {
  projectId: string;
  value: string;
  onChange: (value: string) => void;
  /** Callback when execute is triggered (Cmd+Enter or button click) */
  onExecute: (query: string) => void;
  /** Whether a search is currently in progress */
  isLoading?: boolean;
  placeholder?: string;
  className?: string;
}

interface Suggestion {
  type: "field" | "value" | "operator";
  value: string;
  label: string;
  description?: string;
}

// ============================================================================
// Parser
// ============================================================================

interface ParseContext {
  currentSegment: string;
  context: "field" | "value" | "operator" | "search";
  activeField?: FilterField;
  segmentStart: number;
  conditions: Array<{
    field: FilterField;
    value: string;
    operator?: "AND" | "OR";
  }>;
}

const LOGICAL_OPERATORS = ["AND", "OR"] as const;

// ============================================================================
// Syntax Highlighting
// ============================================================================

interface HighlightedSegment {
  text: string;
  type: "field" | "comparison" | "value" | "logical" | "plain";
}

/**
 * Tokenize the query input for syntax highlighting
 * Supports operators: =, ==, !=, <>, >, >=, <, <=
 */
function tokenizeForHighlight(input: string): HighlightedSegment[] {
  if (!input) return [];

  const segments: HighlightedSegment[] = [];
  // Match: field<op>value, AND, OR, or plain text
  // Operators: >=, <=, !=, <>, ==, =, >, <
  const regex = /(\s+)|(AND|OR)(?=\s|$)|([a-zA-Z][a-zA-Z0-9_.]*)(>=|<=|!=|<>|==|=|>|<)("[^"]*"?|'[^']*'?|[^\s"']*)/gi;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(input)) !== null) {
    // Add any text before this match as plain
    if (match.index > lastIndex) {
      segments.push({
        text: input.slice(lastIndex, match.index),
        type: "plain",
      });
    }

    if (match[1]) {
      // Whitespace
      segments.push({ text: match[1], type: "plain" });
    } else if (match[2]) {
      // AND or OR
      segments.push({ text: match[2], type: "logical" });
    } else if (match[3] && match[4] && match[5] !== undefined) {
      // field<op>value pattern
      segments.push({ text: match[3], type: "field" });
      segments.push({ text: match[4], type: "comparison" });
      segments.push({ text: match[5], type: "value" });
    }

    lastIndex = regex.lastIndex;
  }

  // Add remaining text
  if (lastIndex < input.length) {
    segments.push({
      text: input.slice(lastIndex),
      type: "plain",
    });
  }

  return segments;
}

// Regex to find comparison operators: >=, <=, !=, <>, ==, =, >, <
const COMPARISON_OP_REGEX = /(>=|<=|!=|<>|==|=|>|<)/;

function parseQueryInput(input: string): ParseContext {
  const trimmed = input.trimStart();

  const conditions: ParseContext["conditions"] = [];
  const remaining = trimmed;
  let lastOperator: "AND" | "OR" | undefined;

  const parts = remaining.split(/\s+(AND|OR)\s+/i);

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]?.trim() ?? "";

    if (part.toUpperCase() === "AND" || part.toUpperCase() === "OR") {
      lastOperator = part.toUpperCase() as "AND" | "OR";
      continue;
    }

    // Match field<op>value pattern
    const opMatch = part.match(/^([a-zA-Z][a-zA-Z0-9_.]*)(>=|<=|!=|<>|==|=|>|<)(.+)$/);
    if (opMatch) {
      const [, field, , rawValue] = opMatch;
      let value = rawValue!.trim();

      // Remove quotes for stored value
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      if (value && i < parts.length - 1) {
        conditions.push({
          field: field as FilterField,
          value,
          operator: lastOperator,
        });
        lastOperator = undefined;
      }
    }
  }

  const lastOpMatch = trimmed.match(/.*\s+(AND|OR)\s+/i);
  const currentPart = lastOpMatch
    ? trimmed.substring(lastOpMatch[0].length)
    : trimmed;

  const segmentStart = lastOpMatch ? lastOpMatch[0].length : 0;

  // Find any comparison operator in the current part
  const compOpMatch = currentPart.match(COMPARISON_OP_REGEX);

  if (!compOpMatch) {
    if (currentPart.toUpperCase() === "AND" || currentPart.toUpperCase() === "OR") {
      return {
        currentSegment: "",
        context: "field",
        segmentStart: input.length,
        conditions,
      };
    }

    // Check if previous part ends with a complete quoted value
    const prevParts = trimmed.substring(0, segmentStart).trim();
    const lastPrevPart = prevParts.split(/\s+/).pop() ?? "";
    if (prevParts && /(>=|<=|!=|<>|==|=|>|<)"[^"]*"$|(>=|<=|!=|<>|==|=|>|<)'[^']*'$|(>=|<=|!=|<>|==|=|>|<)\d+$/.test(lastPrevPart)) {
      if (currentPart.length > 0 && !COMPARISON_OP_REGEX.test(currentPart)) {
        const upperPart = currentPart.toUpperCase();
        if ("AND".startsWith(upperPart) || "OR".startsWith(upperPart)) {
          return {
            currentSegment: currentPart,
            context: "operator",
            segmentStart,
            conditions,
          };
        }
      }
    }

    return {
      currentSegment: currentPart,
      context: "field",
      segmentStart,
      conditions,
    };
  }

  const opIndex = compOpMatch.index!;
  const opLength = compOpMatch[0].length;
  const field = currentPart.substring(0, opIndex).trim();
  const valueRaw = currentPart.substring(opIndex + opLength);

  // Handle quoted values - strip leading quote for current segment
  let currentSegment = valueRaw;
  if (valueRaw.startsWith('"')) {
    currentSegment = valueRaw.substring(1);
    // If there's a closing quote, we're done with the value
    if (currentSegment.endsWith('"')) {
      currentSegment = currentSegment.slice(0, -1);
    }
  } else if (valueRaw.startsWith("'")) {
    currentSegment = valueRaw.substring(1);
    if (currentSegment.endsWith("'")) {
      currentSegment = currentSegment.slice(0, -1);
    }
  }

  // Adjust segment start for the quote
  const quoteOffset = valueRaw.startsWith('"') || valueRaw.startsWith("'") ? 1 : 0;

  return {
    currentSegment,
    context: "value",
    activeField: field as FilterField,
    segmentStart: segmentStart + opIndex + opLength + quoteOffset,
    conditions,
  };
}

// ============================================================================
// Component
// ============================================================================

export function QueryBuilderInput({
  projectId,
  value,
  onChange,
  onExecute,
  isLoading = false,
  placeholder = 'service.name="api" AND span.type="HTTP"',
  className,
}: QueryBuilderInputProps) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  const { fields, getValueSuggestions } = useFilterAutocomplete({
    projectId,
    enabled: showSuggestions,
  });

  const parsed = useMemo(() => parseQueryInput(value), [value]);

  // Tokenize for syntax highlighting
  const highlightedSegments = useMemo(() => tokenizeForHighlight(value), [value]);

  const suggestions = useMemo((): Suggestion[] => {
    if (!showSuggestions || !value.trim()) return [];

    if (parsed.context === "field") {
      const search = parsed.currentSegment.toLowerCase();

      if (!search) return fields.slice(0, 10).map((f) => ({
        type: "field" as const,
        value: f.field,
        label: f.label,
        description: f.field,
      }));

      return fields
        .filter(
          (f) =>
            f.field.toLowerCase().includes(search) ||
            f.label.toLowerCase().includes(search)
        )
        .slice(0, 10)
        .map((f) => ({
          type: "field" as const,
          value: f.field,
          label: f.label,
          description: f.field,
        }));
    }

    if (parsed.context === "value" && parsed.activeField) {
      const valueSuggestions = getValueSuggestions(
        parsed.activeField,
        parsed.currentSegment
      );

      return valueSuggestions.map((v) => ({
        type: "value" as const,
        value: v,
        label: v,
      }));
    }

    if (parsed.context === "operator") {
      const search = parsed.currentSegment.toUpperCase();
      return LOGICAL_OPERATORS.filter((op) => op.startsWith(search)).map((op) => ({
        type: "operator" as const,
        value: op,
        label: op,
        description: op === "AND" ? "All conditions must match" : "Any condition can match",
      }));
    }

    return [];
  }, [showSuggestions, value, parsed, fields, getValueSuggestions]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [suggestions.length]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.value);
      setShowSuggestions(true);
    },
    [onChange]
  );

  const handleClear = useCallback(() => {
    onChange("");
    setShowSuggestions(false);
    inputRef.current?.focus();
  }, [onChange]);

  const handleExecute = useCallback(() => {
    if (value.trim() && !isLoading) {
      setShowSuggestions(false);
      onExecute(value.trim());
    }
  }, [value, isLoading, onExecute]);

  const applySuggestion = useCallback(
    (suggestion: Suggestion) => {
      if (suggestion.type === "field") {
        const before = value.substring(0, parsed.segmentStart);
        const newValue = `${before}${suggestion.value}="`;
        onChange(newValue);
        setShowSuggestions(true);
      } else if (suggestion.type === "value") {
        // Find position before the opening quote
        const eqIndex = value.lastIndexOf("=");
        const before = eqIndex > 0 ? value.substring(0, eqIndex + 1) : value.substring(0, parsed.segmentStart);
        // Wrap value in quotes and add closing quote
        const newValue = `${before}"${suggestion.value}" `;
        onChange(newValue);
        setShowSuggestions(false);
      } else if (suggestion.type === "operator") {
        const before = value.substring(0, parsed.segmentStart);
        const newValue = `${before}${suggestion.value} `;
        onChange(newValue);
        setShowSuggestions(true);
      }

      inputRef.current?.focus();
    },
    [value, parsed, onChange]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      // Cmd+Enter (Mac) or Ctrl+Enter (Windows) to execute
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleExecute();
        return;
      }

      if (!showSuggestions || suggestions.length === 0) {
        if (e.key === "Escape") {
          setShowSuggestions(false);
        }
        return;
      }

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, suggestions.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case "Tab":
        case "Enter":
          e.preventDefault();
          if (suggestions[selectedIndex]) {
            applySuggestion(suggestions[selectedIndex]);
          }
          break;
        case "Escape":
          e.preventDefault();
          setShowSuggestions(false);
          break;
      }
    },
    [showSuggestions, suggestions, selectedIndex, applySuggestion, handleExecute]
  );

  const handleBlur = useCallback(() => {
    setTimeout(() => setShowSuggestions(false), 200);
  }, []);

  const handleFocus = useCallback(() => {
    if (value.trim()) {
      setShowSuggestions(true);
    }
  }, [value]);

  // Detect Mac vs Windows for shortcut display
  const isMac = typeof navigator !== "undefined" && navigator.platform.toUpperCase().indexOf("MAC") >= 0;
  const shortcutLabel = isMac ? "⌘↵" : "Ctrl+↵";

  // Render a single highlighted segment
  const renderSegment = (segment: HighlightedSegment, index: number) => {
    switch (segment.type) {
      case "logical":
        return (
          <span key={index} className="font-bold text-blue-500 dark:text-blue-400">
            {segment.text}
          </span>
        );
      case "field":
        return (
          <span key={index} className="text-purple-600 dark:text-purple-400">
            {segment.text}
          </span>
        );
      case "comparison":
        return (
          <span key={index} className="font-semibold text-orange-500 dark:text-orange-400">
            {segment.text}
          </span>
        );
      case "value":
        return (
          <span key={index} className="text-green-600 dark:text-green-400">
            {segment.text}
          </span>
        );
      default:
        return <span key={index}>{segment.text}</span>;
    }
  };

  return (
    <div className={cn("relative", className)}>
      {/* Input with execute button */}
      <div className="relative flex items-center gap-1">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground z-10" />

          {/* Highlighted text overlay */}
          <div
            aria-hidden="true"
            className="absolute inset-0 flex items-center pl-8 pr-7 h-8 text-sm font-mono pointer-events-none overflow-hidden whitespace-pre"
          >
            {highlightedSegments.map(renderSegment)}
          </div>

          {/* Actual input - text is transparent, caret is visible */}
          <Input
            ref={inputRef}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onFocus={handleFocus}
            onBlur={handleBlur}
            placeholder={placeholder}
            className="pl-8 pr-7 h-8 text-sm bg-muted/30 border-muted font-mono text-transparent caret-foreground"
            autoComplete="off"
            spellCheck={false}
          />
          {value && (
            <button
              type="button"
              onClick={handleClear}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground hover:text-foreground z-10"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* Execute button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="default"
              size="sm"
              onClick={handleExecute}
              disabled={!value.trim() || isLoading}
              className="h-8 px-2.5"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>Execute search ({shortcutLabel})</p>
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Suggestions dropdown */}
      {showSuggestions && suggestions.length > 0 && (
        <div
          ref={suggestionsRef}
          className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md"
        >
          <div className="max-h-[300px] overflow-auto p-1">
            {suggestions.map((suggestion, index) => (
              <button
                key={`${suggestion.type}-${suggestion.value}`}
                type="button"
                onClick={() => applySuggestion(suggestion)}
                onMouseEnter={() => setSelectedIndex(index)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm",
                  "hover:bg-accent hover:text-accent-foreground",
                  index === selectedIndex && "bg-accent text-accent-foreground"
                )}
              >
                {suggestion.type === "field" && (
                  <>
                    <span className="flex-1 text-left font-medium">
                      {suggestion.label}
                    </span>
                    <span className="text-xs text-muted-foreground font-mono">
                      {suggestion.description}
                    </span>
                  </>
                )}
                {suggestion.type === "value" && (
                  <span className="flex-1 text-left font-mono">
                    {suggestion.label}
                  </span>
                )}
                {suggestion.type === "operator" && (
                  <>
                    <span className="font-bold text-primary">
                      {suggestion.label}
                    </span>
                    <span className="flex-1 text-xs text-muted-foreground">
                      {suggestion.description}
                    </span>
                  </>
                )}
              </button>
            ))}
          </div>

          {/* Hint at bottom */}
          <div className="border-t px-2 py-1.5 text-xs text-muted-foreground flex items-center justify-between">
            <span>
              <kbd className="rounded bg-muted px-1">Tab</kbd> to complete,{" "}
              <kbd className="rounded bg-muted px-1">↑↓</kbd> navigate
            </span>
            <span>
              <kbd className="rounded bg-muted px-1">{shortcutLabel}</kbd> execute
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
