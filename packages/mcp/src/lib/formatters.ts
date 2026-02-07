import type {
  TraceRow,
  TraceTableOptions,
  SpanNode,
  FlatSpan,
  ErrorGroup,
  CostModelRow,
  CostDayRow,
  CostServiceRow,
  TraceStatsData,
  ProjectInfo,
} from "./types.js";

// ============================================================
// Primitive Formatters
// ============================================================

export function formatDuration(ms: number | null): string {
  if (ms === null) return "-";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  return `${(ms / 60000).toFixed(2)}m`;
}

export function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins} min ago`;
  const hours = Math.floor(diffMins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export function formatCost(cost: number | null): string {
  if (cost === null) return "-";
  return `$${cost.toFixed(4)}`;
}

export function formatTokens(tokens: number | null): string {
  if (tokens === null) return "-";
  if (tokens < 1000) return tokens.toString();
  if (tokens < 1000000) return `${(tokens / 1000).toFixed(1)}K`;
  return `${(tokens / 1000000).toFixed(2)}M`;
}

export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + "...";
}

// ============================================================
// Span Tree Builder
// ============================================================

export function buildSpanTree(spans: FlatSpan[]): SpanNode[] {
  const nodeMap = new Map<string, SpanNode>();
  const roots: SpanNode[] = [];

  // Create nodes indexed by externalSpanId
  for (const span of spans) {
    nodeMap.set(span.externalSpanId, { ...span, children: [] });
  }

  // Link children to parents via parentSpanId -> externalSpanId
  for (const span of spans) {
    const node = nodeMap.get(span.externalSpanId)!;
    if (span.parentSpanId) {
      const parent = nodeMap.get(span.parentSpanId);
      if (parent) {
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    } else {
      roots.push(node);
    }
  }

  return roots;
}

// ============================================================
// Error Grouping
// ============================================================

export function groupErrorsByType(
  errorSpans: Array<{
    id: string;
    name: string;
    exceptionType: string | null;
    exceptionMessage: string | null;
    statusMessage: string | null;
    startTime: Date;
    trace: {
      id: string;
      serviceName: string;
      rootSpanName: string | null;
    };
  }>
): ErrorGroup[] {
  const groups = new Map<string, ErrorGroup>();

  for (const span of errorSpans) {
    const type = span.exceptionType || "Unknown Error";
    const existing = groups.get(type);
    if (existing) {
      existing.count++;
      existing.spans.push(span);
    } else {
      groups.set(type, { exceptionType: type, count: 1, spans: [span] });
    }
  }

  return Array.from(groups.values()).sort((a, b) => b.count - a.count);
}

// ============================================================
// Table / Detail Formatters
// ============================================================

export function formatTraceTable(
  traces: TraceRow[],
  options: TraceTableOptions
): string {
  const lines: string[] = [];

  lines.push(
    `Found ${options.total} traces (showing ${traces.length} in last ${options.timeRange})`
  );
  lines.push("");
  lines.push(
    "| ID | Service | Root Span | Duration | Errors | Spans | Time |"
  );
  lines.push(
    "|-----|---------|-----------|----------|--------|-------|------|"
  );

  for (const trace of traces) {
    const id = trace.id.slice(0, 8);
    const service = truncate(trace.serviceName, 15);
    const rootSpan = truncate(trace.rootSpanName || "-", 20);
    const duration = formatDuration(trace.durationMs);
    const errors = trace.errorCount > 0 ? `${trace.errorCount}` : "-";
    const spans = trace.spanCount.toString();
    const time = formatRelativeTime(trace.startTime);

    lines.push(
      `| ${id} | ${service} | ${rootSpan} | ${duration} | ${errors} | ${spans} | ${time} |`
    );
  }

  if (options.nextCursor) {
    lines.push("");
    lines.push(`Next page: cursor=${options.nextCursor}`);
  }

  return lines.join("\n");
}

export function formatTraceDetail(
  trace: {
    id: string;
    serviceName: string;
    durationMs: number | null;
    startTime: Date;
    hasError: boolean;
    spans: FlatSpan[];
  },
  includeInputOutput: boolean
): string {
  const lines: string[] = [];

  lines.push(`# Trace: ${trace.id}`);
  lines.push("");
  lines.push(`**Service:** ${trace.serviceName}`);
  lines.push(`**Duration:** ${formatDuration(trace.durationMs)}`);
  lines.push(`**Started:** ${trace.startTime.toISOString()}`);
  lines.push(`**Status:** ${trace.hasError ? "ERROR" : "OK"}`);
  lines.push(`**Spans:** ${trace.spans.length}`);
  lines.push("");

  const tree = buildSpanTree(trace.spans);

  lines.push("## Span Tree");
  lines.push("");
  lines.push(formatSpanTree(tree, 0));

  if (includeInputOutput) {
    const llmSpans = trace.spans.filter((s) => s.spanType === "LLM");
    if (llmSpans.length > 0) {
      lines.push("");
      lines.push("## LLM Span Details");

      for (const span of llmSpans) {
        lines.push("");
        lines.push(`### ${span.name}`);
        if (span.model) lines.push(`**Model:** ${span.model}`);
        if (span.promptTokens) {
          lines.push(
            `**Tokens:** ${span.promptTokens} in / ${span.completionTokens || 0} out`
          );
        }
        if (span.totalCost) lines.push(`**Cost:** ${formatCost(span.totalCost)}`);

        if (span.input) {
          lines.push("");
          lines.push("**Input:**");
          lines.push("```json");
          lines.push(truncate(JSON.stringify(span.input, null, 2), 2000));
          lines.push("```");
        }

        if (span.output) {
          lines.push("");
          lines.push("**Output:**");
          lines.push("```json");
          lines.push(truncate(JSON.stringify(span.output, null, 2), 2000));
          lines.push("```");
        }
      }
    }
  }

  return lines.join("\n");
}

export function formatSpanTree(nodes: SpanNode[], depth: number): string {
  const lines: string[] = [];
  const indent = "  ".repeat(depth);

  for (const node of nodes) {
    const duration = formatDuration(node.durationMs);
    const typeTag = node.spanType ? `[${node.spanType}]` : "";
    const statusIcon = node.statusCode === "ERROR" ? " !!" : "";

    let extra = "";
    if (node.model) extra += ` model=${node.model}`;
    if (node.httpMethod) extra += ` ${node.httpMethod} ${node.httpStatusCode || ""}`;
    if (node.dbSystem) extra += ` ${node.dbSystem} ${node.dbOperation || ""}`;
    if (node.exceptionType) extra += ` exception=${node.exceptionType}`;

    lines.push(
      `${indent}- ${node.name} (${duration}) ${typeTag}${statusIcon}${extra}`.trimEnd()
    );

    if (node.children.length > 0) {
      lines.push(formatSpanTree(node.children, depth + 1));
    }
  }

  return lines.join("\n");
}

export function formatErrorSummary(
  groups: ErrorGroup[],
  timeRange: string
): string {
  const lines: string[] = [];
  const totalErrors = groups.reduce((sum, g) => sum + g.count, 0);

  lines.push(`# Error Summary (last ${timeRange})`);
  lines.push("");
  lines.push(`Total error spans: ${totalErrors}`);
  lines.push(`Unique error types: ${groups.length}`);
  lines.push("");

  for (const group of groups) {
    lines.push(`## ${group.exceptionType} (${group.count} occurrences)`);
    lines.push("");

    for (const span of group.spans.slice(0, 5)) {
      const msg = span.exceptionMessage || span.statusMessage || "No message";
      const time = formatRelativeTime(span.startTime);
      lines.push(
        `- **${span.trace.serviceName}** / ${span.name} - ${truncate(msg, 80)} (${time})`
      );
      lines.push(`  Trace: ${span.trace.id}`);
    }

    if (group.spans.length > 5) {
      lines.push(`  ... and ${group.spans.length - 5} more`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function formatSpanSearchResults(
  spans: Array<{
    id: string;
    traceId: string;
    name: string;
    spanType: string | null;
    statusCode: string;
    durationMs: number | null;
    startTime: Date;
    model: string | null;
    exceptionType: string | null;
    trace: { serviceName: string };
  }>,
  input: { query?: string; spanType?: string; timeRange: string }
): string {
  const lines: string[] = [];

  const filterDesc = [
    input.query && `query="${input.query}"`,
    input.spanType && `type=${input.spanType}`,
  ]
    .filter(Boolean)
    .join(", ");

  lines.push(
    `# Span Search Results (last ${input.timeRange}${filterDesc ? `, ${filterDesc}` : ""})`
  );
  lines.push("");
  lines.push(`Found ${spans.length} spans`);
  lines.push("");
  lines.push(
    "| Name | Type | Status | Duration | Model | Service | Time |"
  );
  lines.push(
    "|------|------|--------|----------|-------|---------|------|"
  );

  for (const span of spans) {
    const name = truncate(span.name, 25);
    const type = span.spanType || "-";
    const status = span.statusCode === "ERROR" ? "ERROR" : "OK";
    const duration = formatDuration(span.durationMs);
    const model = span.model ? truncate(span.model, 15) : "-";
    const service = truncate(span.trace.serviceName, 12);
    const time = formatRelativeTime(span.startTime);

    lines.push(
      `| ${name} | ${type} | ${status} | ${duration} | ${model} | ${service} | ${time} |`
    );
  }

  return lines.join("\n");
}

export function formatCostByModel(
  summaries: CostModelRow[],
  timeRange: string
): string {
  const lines: string[] = [];

  lines.push(`# Cost Summary by Model (last ${timeRange})`);
  lines.push("");
  lines.push("| Model | Spans | Input Tokens | Output Tokens | Total Cost |");
  lines.push("|-------|-------|-------------|--------------|------------|");

  let totalCost = 0;
  for (const row of summaries) {
    totalCost += row.totalCost;

    lines.push(
      `| ${row.model ?? "-"} | ${row.spanCount} | ${formatTokens(row.inputTokens)} | ${formatTokens(row.outputTokens)} | ${formatCost(row.totalCost)} |`
    );
  }

  lines.push("");
  lines.push(`**Total Cost:** $${totalCost.toFixed(4)}`);

  return lines.join("\n");
}

export function formatCostByDay(
  summaries: CostDayRow[],
  timeRange: string
): string {
  const lines: string[] = [];

  lines.push(`# Daily Cost Summary (last ${timeRange})`);
  lines.push("");
  lines.push("| Date | Spans | Input Tokens | Output Tokens | Total Cost |");
  lines.push("|------|-------|-------------|--------------|------------|");

  let totalCost = 0;
  for (const row of summaries) {
    const dateStr = row.date.toISOString().split("T")[0];
    totalCost += row.totalCost;

    lines.push(
      `| ${dateStr} | ${row.spanCount} | ${formatTokens(row.inputTokens)} | ${formatTokens(row.outputTokens)} | ${formatCost(row.totalCost)} |`
    );
  }

  lines.push("");
  lines.push(`**Total Cost:** $${totalCost.toFixed(4)}`);

  return lines.join("\n");
}

export function formatCostByService(
  stats: CostServiceRow[],
  timeRange: string
): string {
  const lines: string[] = [];

  lines.push(`# Cost Summary by Model from Spans (last ${timeRange})`);
  lines.push("");
  lines.push(
    "| Model | Span Count | Prompt Tokens | Completion Tokens | Total Cost |"
  );
  lines.push(
    "|-------|-----------|--------------|------------------|------------|"
  );

  for (const row of stats) {
    lines.push(
      `| ${row.model || "-"} | ${row.spanCount} | ${formatTokens(row.promptTokens)} | ${formatTokens(row.completionTokens)} | ${formatCost(row.totalCost)} |`
    );
  }

  return lines.join("\n");
}

export function formatTraceStats(stats: TraceStatsData): string {
  const lines: string[] = [];
  const errorRate =
    stats.totalCount > 0
      ? ((stats.errorCount / stats.totalCount) * 100).toFixed(1)
      : "0.0";

  lines.push(`# Trace Statistics (last ${stats.timeRange})`);
  lines.push("");
  lines.push(`**Total Traces:** ${stats.totalCount}`);
  lines.push(`**Error Traces:** ${stats.errorCount} (${errorRate}%)`);
  lines.push("");

  lines.push("## Latency Percentiles");
  lines.push("");
  for (const [key, value] of Object.entries(stats.percentiles)) {
    lines.push(`- **${key}:** ${formatDuration(value)}`);
  }

  if (stats.serviceStats.length > 0) {
    lines.push("");
    lines.push("## By Service");
    lines.push("");
    lines.push("| Service | Traces | Avg Duration | Error Rate |");
    lines.push("|---------|--------|-------------|------------|");

    for (const svc of stats.serviceStats) {
      const svcErrors =
        stats.errorRateByService.find(
          (e) => e.serviceName === svc.serviceName
        )?._count ?? 0;
      const svcErrorRate =
        svc._count > 0 ? ((svcErrors / svc._count) * 100).toFixed(1) : "0.0";

      lines.push(
        `| ${svc.serviceName} | ${svc._count} | ${formatDuration(svc._avg.durationMs)} | ${svcErrorRate}% |`
      );
    }
  }

  return lines.join("\n");
}

export function formatProjectInfo(project: ProjectInfo): string {
  const lines: string[] = [];

  lines.push(`# Project: ${project.name}`);
  lines.push("");
  lines.push(`**Project ID:** ${project.id}`);
  lines.push(`**Workspace:** ${project.workspace.name}`);
  lines.push(`**Created:** ${project.createdAt.toISOString().split("T")[0]}`);
  lines.push(`**Total Traces:** ${project._count.traces}`);
  lines.push(`**API Keys:** ${project._count.apiKeys}`);

  return lines.join("\n");
}
