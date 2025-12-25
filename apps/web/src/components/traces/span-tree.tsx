"use client";

import { useState, useCallback, useMemo } from "react";
import {
  ChevronRight,
  ChevronDown,
  AlertCircle,
  Coins,
  Zap,
  Copy,
  Check,
  Globe,
  Database,
  Code,
  Clock,
  Tag,
  FileJson,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { formatDuration, formatTokens, formatCost } from "@/lib/format";
import { clipboardToast } from "@/lib/success";
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
  // LLM fields
  model: string | null;
  modelParameters: unknown;
  input: unknown;
  output: unknown;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  inputCost: number | null;
  outputCost: number | null;
  totalCost: number | null;
  genAiProvider: string | null;
  genAiOperation: string | null;
  // Error fields
  exceptionMessage: string | null;
  exceptionType: string | null;
  // HTTP fields
  httpMethod: string | null;
  httpUrl: string | null;
  httpStatusCode: number | null;
  httpRoute: string | null;
  // DB fields
  dbSystem: string | null;
  dbName: string | null;
  dbStatement: string | null;
  dbOperation: string | null;
  // A/B Testing fields
  promptVariantId: string | null;
  promptVersionId: string | null;
  promptExperimentId: string | null;
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
  RPC: {
    bg: "bg-cyan-50 dark:bg-cyan-950/30",
    text: "text-cyan-700 dark:text-cyan-300",
    border: "border-cyan-200 dark:border-cyan-800",
  },
  CUSTOM: {
    bg: "bg-slate-50 dark:bg-slate-950/30",
    text: "text-slate-700 dark:text-slate-300",
    border: "border-slate-200 dark:border-slate-800",
  },
};

// ------------------------------------------------------------
// Copy Button Component
// ------------------------------------------------------------

function CopyIconButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      clipboardToast.copied("Span ID");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      clipboardToast.copyFailed();
    }
  }, [text]);

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleCopy}
      className="h-4 w-4 shrink-0"
    >
      {copied ? (
        <Check className="h-2.5 w-2.5 text-green-600" />
      ) : (
        <Copy className="h-2.5 w-2.5 text-muted-foreground hover:text-foreground" />
      )}
    </Button>
  );
}

// ------------------------------------------------------------
// Attribute Helpers
// ------------------------------------------------------------

type AttributeMap = Record<string, unknown>;

const parseAttributes = (attributes: unknown): AttributeMap => {
  if (!attributes || typeof attributes !== "object") return {};
  return attributes as AttributeMap;
};

const parseEvents = (events: unknown): Array<{ name: string; timestamp?: string; attributes?: AttributeMap }> => {
  if (!Array.isArray(events)) return [];
  return events;
};

// Extract HTTP-specific info from attributes
const getHttpInfo = (attrs: AttributeMap) => {
  const url = attrs["url.full"] || attrs["http.url"] || attrs["http.target"];
  const method = attrs["http.request.method"] || attrs["http.method"];
  const statusCode = attrs["http.response.status_code"] || attrs["http.status_code"];
  const host = attrs["server.address"] || attrs["http.host"] || attrs["net.peer.name"];
  return { url, method, statusCode, host };
};

// Extract DB-specific info
const getDbInfo = (attrs: AttributeMap) => {
  const system = attrs["db.system"];
  const statement = attrs["db.statement"];
  const operation = attrs["db.operation"];
  const name = attrs["db.name"];
  return { system, statement, operation, name };
};

// Group attributes by category for better display
interface AttributeGroups {
  http: AttributeMap;
  network: AttributeMap;
  custom: AttributeMap;
  other: AttributeMap;
}

const groupAttributes = (attrs: AttributeMap): AttributeGroups => {
  const groups: AttributeGroups = {
    http: {},
    network: {},
    custom: {},
    other: {},
  };

  for (const [key, value] of Object.entries(attrs)) {
    if (key.startsWith("http.") || key.startsWith("url.") || key.startsWith("server.")) {
      groups.http[key] = value;
    } else if (key.startsWith("net.") || key.startsWith("network.")) {
      groups.network[key] = value;
    } else if (key.startsWith("cognobserve.") || !key.includes(".")) {
      groups.custom[key] = value;
    } else {
      groups.other[key] = value;
    }
  }

  return groups;
};

// Format attribute value for display
const formatAttrValue = (value: unknown): string => {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
};

// Format unknown value for display in JSX (converts to string)
const formatUnknownForDisplay = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
};

// Check if unknown value has content
const hasContent = (value: unknown): boolean => {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.length > 0;
  if (typeof value === "object") return Object.keys(value as object).length > 0;
  return true;
};

// ------------------------------------------------------------
// Attribute Display Components
// ------------------------------------------------------------

function AttributeRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start gap-2 py-0.5">
      <span className="text-muted-foreground shrink-0 min-w-[120px]">{label}:</span>
      <span className={cn("break-all", mono && "font-mono")}>{value}</span>
    </div>
  );
}

function AttributeSection({ title, icon: Icon, attributes }: { title: string; icon: React.ElementType; attributes: AttributeMap }) {
  const entries = Object.entries(attributes);
  if (entries.length === 0) return null;

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
        <Icon className="h-3 w-3" />
        {title}
      </div>
      <div className="text-[11px] pl-4 space-y-0.5">
        {entries.map(([key, value]) => (
          <AttributeRow key={key} label={key} value={formatAttrValue(value)} mono />
        ))}
      </div>
    </div>
  );
}

function HttpSummary({ attrs }: { attrs: AttributeMap }) {
  const { url, method, statusCode, host } = getHttpInfo(attrs);
  if (!url && !method) return null;

  const statusNum = typeof statusCode === "number" ? statusCode : Number(statusCode);
  const isSuccess = !isNaN(statusNum) && statusNum >= 200 && statusNum < 400;
  const isHttpError = !isNaN(statusNum) && statusNum >= 400;

  const methodStr = method ? String(method) : null;
  const statusStr = statusCode ? String(statusCode) : null;
  const hostStr = host ? String(host) : null;
  const urlStr = url ? String(url) : null;

  return (
    <div className="rounded bg-muted/50 p-2 space-y-1">
      <div className="flex items-center gap-2 text-[11px]">
        <Globe className="h-3.5 w-3.5 text-blue-600" />
        {methodStr && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">
            {methodStr}
          </Badge>
        )}
        {statusStr && (
          <Badge
            variant="outline"
            className={cn(
              "text-[10px] px-1.5 py-0 font-mono",
              isSuccess && "border-green-500 text-green-600",
              isHttpError && "border-red-500 text-red-600"
            )}
          >
            {statusStr}
          </Badge>
        )}
        {hostStr && <span className="text-muted-foreground">{hostStr}</span>}
      </div>
      {urlStr && (
        <div className="text-[11px] font-mono text-muted-foreground break-all pl-5">
          {urlStr}
        </div>
      )}
    </div>
  );
}

function DbSummary({ attrs }: { attrs: AttributeMap }) {
  const { system, statement, operation, name } = getDbInfo(attrs);
  if (!system && !statement) return null;

  const systemStr = system ? String(system) : null;
  const operationStr = operation ? String(operation) : null;
  const nameStr = name ? String(name) : null;
  const statementStr = statement ? String(statement) : null;

  return (
    <div className="rounded bg-muted/50 p-2 space-y-1">
      <div className="flex items-center gap-2 text-[11px]">
        <Database className="h-3.5 w-3.5 text-green-600" />
        {systemStr && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">
            {systemStr}
          </Badge>
        )}
        {operationStr && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">
            {operationStr}
          </Badge>
        )}
        {nameStr && <span className="text-muted-foreground">{nameStr}</span>}
      </div>
      {statementStr && (
        <pre className="text-[10px] font-mono text-muted-foreground bg-muted rounded p-1.5 overflow-x-auto max-h-24">
          {statementStr}
        </pre>
      )}
    </div>
  );
}

function CustomAttributesSummary({ attrs }: { attrs: AttributeMap }) {
  const customAttrs = Object.entries(attrs).filter(
    ([key]) => key.startsWith("cognobserve.") || !key.includes(".")
  );
  if (customAttrs.length === 0) return null;

  return (
    <div className="rounded bg-muted/50 p-2 space-y-1">
      <div className="flex items-center gap-2 text-[11px] font-medium">
        <Tag className="h-3.5 w-3.5 text-orange-600" />
        Custom Attributes
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11px] pl-5">
        {customAttrs.map(([key, value]) => (
          <div key={key} className="flex items-center gap-1">
            <span className="text-muted-foreground">{key.replace("cognobserve.", "")}:</span>
            <span className="font-mono truncate">{formatAttrValue(value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function EventsList({ events }: { events: Array<{ name: string; timestamp?: string; attributes?: AttributeMap }> }) {
  if (events.length === 0) return null;

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
        <Clock className="h-3 w-3" />
        Events ({events.length})
      </div>
      <div className="space-y-1 pl-4">
        {events.map((event, idx) => (
          <div key={idx} className="rounded bg-muted/50 p-1.5 text-[11px]">
            <div className="flex items-center gap-2">
              <span className="font-medium">{event.name}</span>
              {event.timestamp && (
                <span className="text-muted-foreground text-[10px]">
                  {new Date(event.timestamp).toLocaleTimeString()}
                </span>
              )}
            </div>
            {event.attributes && Object.keys(event.attributes).length > 0 && (
              <div className="mt-1 text-[10px] text-muted-foreground font-mono">
                {JSON.stringify(event.attributes)}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function RawJsonViewer({ data, label }: { data: unknown; label: string }) {
  const [expanded, setExpanded] = useState(false);
  const jsonStr = JSON.stringify(data, null, 2);

  if (!data || (typeof data === "object" && Object.keys(data).length === 0)) {
    return null;
  }

  return (
    <div className="space-y-1">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground"
      >
        <FileJson className="h-3 w-3" />
        {label}
        <ChevronRight className={cn("h-3 w-3 transition-transform", expanded && "rotate-90")} />
      </button>
      {expanded && (
        <pre className="text-[10px] font-mono bg-muted rounded p-2 overflow-x-auto max-h-48">
          {jsonStr}
        </pre>
      )}
    </div>
  );
}

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
// Span Details Component
// ------------------------------------------------------------

function SpanDetails({ node, isError }: { node: SpanNode; isError: boolean }) {
  const attrs = parseAttributes(node.attributes);
  const events = parseEvents(node.events);
  const groups = groupAttributes(attrs);
  const hasAttributes = Object.keys(attrs).length > 0;
  const hasEvents = events.length > 0;
  const hasInput = hasContent(node.input);
  const hasOutput = hasContent(node.output);
  const hasModelParams = hasContent(node.modelParameters);
  const hasIO = hasInput || hasOutput;

  return (
    <div className="border-t">
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="w-full justify-start rounded-none border-b bg-transparent h-8 px-2">
          <TabsTrigger value="overview" className="text-[11px] h-6 px-2 data-[state=active]:bg-muted">
            Overview
          </TabsTrigger>
          {hasIO && (
            <TabsTrigger value="io" className="text-[11px] h-6 px-2 data-[state=active]:bg-muted">
              Input/Output
            </TabsTrigger>
          )}
          {hasAttributes && (
            <TabsTrigger value="attributes" className="text-[11px] h-6 px-2 data-[state=active]:bg-muted">
              Attributes ({Object.keys(attrs).length})
            </TabsTrigger>
          )}
          {hasEvents && (
            <TabsTrigger value="events" className="text-[11px] h-6 px-2 data-[state=active]:bg-muted">
              Events ({events.length})
            </TabsTrigger>
          )}
          <TabsTrigger value="raw" className="text-[11px] h-6 px-2 data-[state=active]:bg-muted">
            Raw
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="p-3 space-y-3 mt-0">
          {/* Error/Exception Details */}
          {(isError || node.exceptionMessage) && (
            <div className="rounded bg-destructive/10 border border-destructive/20 px-3 py-2 text-[11px] text-destructive">
              <div className="flex items-center gap-2 font-medium">
                <AlertCircle className="h-3.5 w-3.5" />
                {node.exceptionType || "Error"}
              </div>
              <div className="mt-1 font-mono">
                {node.exceptionMessage || node.statusMessage || "Unknown error"}
              </div>
            </div>
          )}

          {/* LLM Details */}
          {node.type === "LLM" && (node.model || node.genAiProvider) && (
            <div className="rounded bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 p-2 space-y-2">
              <div className="flex items-center gap-2 text-[11px]">
                <Zap className="h-3.5 w-3.5 text-purple-600" />
                <span className="font-medium">LLM Call</span>
                {node.genAiProvider && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    {node.genAiProvider}
                  </Badge>
                )}
                {node.model && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">
                    {node.model}
                  </Badge>
                )}
                {node.genAiOperation && (
                  <span className="text-muted-foreground">{node.genAiOperation}</span>
                )}
              </div>
              <div className="flex flex-wrap gap-4 text-[11px] pl-5 text-muted-foreground">
                {node.totalTokens !== null && (
                  <div>
                    <span className="font-medium text-foreground">{formatTokens(node.totalTokens)}</span> tokens
                    {node.promptTokens !== null && node.completionTokens !== null && (
                      <span className="text-muted-foreground/60">
                        {" "}({formatTokens(node.promptTokens)} in / {formatTokens(node.completionTokens)} out)
                      </span>
                    )}
                  </div>
                )}
                {node.totalCost !== null && node.totalCost > 0 && (
                  <div className="flex items-center gap-1">
                    <Coins className="h-3 w-3" />
                    <span className="font-medium text-foreground">{formatCost(node.totalCost)}</span>
                    {node.inputCost !== null && node.outputCost !== null && (
                      <span className="text-muted-foreground/60">
                        ({formatCost(node.inputCost)} in / {formatCost(node.outputCost)} out)
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* HTTP Summary - Use extracted fields first, fallback to attributes */}
          {node.type === "HTTP" && (
            <div className="rounded bg-muted/50 p-2 space-y-1">
              <div className="flex items-center gap-2 text-[11px]">
                <Globe className="h-3.5 w-3.5 text-blue-600" />
                {(node.httpMethod) && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">
                    {node.httpMethod}
                  </Badge>
                )}
                {node.httpStatusCode !== null && (
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px] px-1.5 py-0 font-mono",
                      node.httpStatusCode >= 200 && node.httpStatusCode < 400 && "border-green-500 text-green-600",
                      node.httpStatusCode >= 400 && "border-red-500 text-red-600"
                    )}
                  >
                    {node.httpStatusCode}
                  </Badge>
                )}
                {node.httpRoute && (
                  <span className="text-muted-foreground font-mono">{node.httpRoute}</span>
                )}
              </div>
              {node.httpUrl && (
                <div className="text-[11px] font-mono text-muted-foreground break-all pl-5">
                  {node.httpUrl}
                </div>
              )}
            </div>
          )}

          {/* DB Summary - Use extracted fields */}
          {node.type === "DB" && node.dbSystem && (
            <div className="rounded bg-muted/50 p-2 space-y-1">
              <div className="flex items-center gap-2 text-[11px]">
                <Database className="h-3.5 w-3.5 text-green-600" />
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">
                  {node.dbSystem}
                </Badge>
                {node.dbOperation && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">
                    {node.dbOperation}
                  </Badge>
                )}
                {node.dbName && <span className="text-muted-foreground">{node.dbName}</span>}
              </div>
              {node.dbStatement && (
                <pre className="text-[10px] font-mono text-muted-foreground bg-muted rounded p-1.5 overflow-x-auto max-h-24 mt-1">
                  {node.dbStatement}
                </pre>
              )}
            </div>
          )}

          {/* A/B Test Info */}
          {node.promptVariantId && (
            <div className="rounded bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 p-2">
              <div className="flex items-center gap-2 text-[11px]">
                <Tag className="h-3.5 w-3.5 text-orange-600" />
                <span className="font-medium">A/B Experiment</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px] pl-5 mt-1 text-muted-foreground">
                {node.promptExperimentId && (
                  <div>Experiment: <span className="font-mono">{node.promptExperimentId.slice(0, 8)}...</span></div>
                )}
                {node.promptVariantId && (
                  <div>Variant: <span className="font-mono">{node.promptVariantId.slice(0, 8)}...</span></div>
                )}
                {node.promptVersionId && (
                  <div>Version: <span className="font-mono">{node.promptVersionId.slice(0, 8)}...</span></div>
                )}
              </div>
            </div>
          )}

          {/* Custom Attributes Summary */}
          <CustomAttributesSummary attrs={attrs} />

          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[11px]">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Span ID:</span>
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">
                {node.externalSpanId}
              </code>
              <CopyIconButton text={node.externalSpanId} />
            </div>
            {node.kind !== "INTERNAL" && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Kind:</span>
                <span>{node.kind}</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Duration:</span>
              <span className="font-mono">{formatDuration(node.durationMs)}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Status:</span>
              <Badge
                variant="outline"
                className={cn(
                  "text-[10px] px-1.5 py-0",
                  isError ? "border-red-500 text-red-600" : "border-green-500 text-green-600"
                )}
              >
                {node.statusCode}
              </Badge>
            </div>
            {node.libraryName && (
              <div className="flex items-center gap-2 col-span-2">
                <span className="text-muted-foreground">Library:</span>
                <span className="font-mono text-[10px]">
                  {node.libraryName}
                  {node.libraryVersion && `@${node.libraryVersion}`}
                </span>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Input/Output Tab - For LLM prompts and responses */}
        <TabsContent value="io" className="p-3 space-y-3 mt-0">
          {hasInput && (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-[11px] font-medium">
                <Code className="h-3 w-3 text-blue-600" />
                Input
              </div>
              <pre className="text-[11px] font-mono bg-muted rounded p-2 overflow-x-auto max-h-64 whitespace-pre-wrap">
                {formatUnknownForDisplay(node.input)}
              </pre>
            </div>
          )}
          {hasOutput && (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-[11px] font-medium">
                <Code className="h-3 w-3 text-green-600" />
                Output
              </div>
              <pre className="text-[11px] font-mono bg-muted rounded p-2 overflow-x-auto max-h-64 whitespace-pre-wrap">
                {formatUnknownForDisplay(node.output)}
              </pre>
            </div>
          )}
          {hasModelParams && (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-[11px] font-medium">
                <FileJson className="h-3 w-3 text-purple-600" />
                Model Parameters
              </div>
              <pre className="text-[11px] font-mono bg-muted rounded p-2 overflow-x-auto max-h-32">
                {formatUnknownForDisplay(node.modelParameters)}
              </pre>
            </div>
          )}
        </TabsContent>

        <TabsContent value="attributes" className="p-3 space-y-3 mt-0">
          {Object.keys(groups.http).length > 0 && (
            <AttributeSection title="HTTP" icon={Globe} attributes={groups.http} />
          )}
          {Object.keys(groups.network).length > 0 && (
            <AttributeSection title="Network" icon={Code} attributes={groups.network} />
          )}
          {Object.keys(groups.custom).length > 0 && (
            <AttributeSection title="Custom" icon={Tag} attributes={groups.custom} />
          )}
          {Object.keys(groups.other).length > 0 && (
            <AttributeSection title="Other" icon={FileJson} attributes={groups.other} />
          )}
        </TabsContent>

        <TabsContent value="events" className="p-3 mt-0">
          <EventsList events={events} />
        </TabsContent>

        <TabsContent value="raw" className="p-3 space-y-2 mt-0">
          <RawJsonViewer data={attrs} label="Attributes JSON" />
          <RawJsonViewer data={events} label="Events JSON" />
          {hasInput && <RawJsonViewer data={node.input} label="Input JSON" />}
          {hasOutput && <RawJsonViewer data={node.output} label="Output JSON" />}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ------------------------------------------------------------
// Span Node Component
// ------------------------------------------------------------

interface SpanNodeProps {
  node: SpanNode;
  isExpanded: boolean;
  expandedIds: Set<string>;
  onToggle: (id: string) => void;
}

function SpanNodeItem({ node, isExpanded, expandedIds, onToggle }: SpanNodeProps) {
  const hasChildren = node.children.length > 0;
  const isError = node.statusCode === "ERROR";
  const typeStyle = SPAN_TYPE_STYLES[node.type];

  return (
    <Collapsible open={isExpanded} onOpenChange={() => onToggle(node.id)}>
      <div
        className={cn(
          "rounded border transition-colors",
          isError
            ? "border-destructive/30 bg-destructive/5"
            : "border-border hover:border-muted-foreground/30"
        )}
      >
        {/* Span Header */}
        <CollapsibleTrigger asChild>
          <button className="flex w-full items-center gap-1.5 p-2 text-left">
            {/* Expand/Collapse Icon */}
            <div className="flex h-4 w-4 shrink-0 items-center justify-center">
              {hasChildren ? (
                isExpanded ? (
                  <ChevronDown className="h-3 w-3 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-3 w-3 text-muted-foreground" />
                )
              ) : (
                <div className="h-1 w-1 rounded-full bg-muted-foreground/30" />
              )}
            </div>

            {/* Span Name */}
            <span
              className={cn(
                "flex-1 truncate text-xs font-medium",
                isError && "text-destructive"
              )}
            >
              {node.name}
            </span>

            {/* Type Badge */}
            <Badge
              variant="secondary"
              className={cn(
                "shrink-0 text-[10px] px-1.5 py-0 font-normal",
                typeStyle.bg,
                typeStyle.text
              )}
            >
              {node.type}
            </Badge>

            {/* Duration */}
            <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
              {formatDuration(node.durationMs)}
            </span>

            {/* Error Icon */}
            {isError && (
              <AlertCircle className="h-3 w-3 shrink-0 text-destructive" />
            )}
          </button>
        </CollapsibleTrigger>

        {/* Expanded Content */}
        <CollapsibleContent>
          <SpanDetails node={node} isError={isError} />
        </CollapsibleContent>
      </div>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div className="ml-4 mt-0.5 space-y-0.5 pl-2">
          {node.children.map((child) => (
            <SpanNodeItem
              key={child.id}
              node={child}
              isExpanded={expandedIds.has(child.id)}
              expandedIds={expandedIds}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </Collapsible>
  );
}

// ------------------------------------------------------------
// Main Component
// ------------------------------------------------------------

// Collect all span IDs for initial expanded state
const collectAllIds = (nodes: SpanNode[]): Set<string> => {
  const ids = new Set<string>();
  const collect = (n: SpanNode) => {
    ids.add(n.id);
    n.children.forEach(collect);
  };
  nodes.forEach(collect);
  return ids;
};

export function SpanTree({ spans }: SpanTreeProps) {
  const tree = useMemo(() => buildSpanTree(spans), [spans]);

  // Track expanded state at top level to prevent re-renders
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => collectAllIds(tree));

  const handleToggle = useCallback((id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  if (spans.length === 0) {
    return (
      <div className="rounded border border-dashed p-4 text-center">
        <p className="text-xs text-muted-foreground">No spans in this trace</p>
      </div>
    );
  }

  const renderNode = (node: SpanNode) => (
    <SpanNodeItem
      key={node.id}
      node={node}
      isExpanded={expandedIds.has(node.id)}
      expandedIds={expandedIds}
      onToggle={handleToggle}
    />
  );

  return (
    <div className="space-y-0.5">
      {tree.map(renderNode)}
    </div>
  );
}
