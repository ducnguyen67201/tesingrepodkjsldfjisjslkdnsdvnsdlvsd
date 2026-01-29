/**
 * Log Utilities
 *
 * Utilities for working with OTLP log severity levels and formatting.
 */

/**
 * OTLP Severity Number ranges (1-24)
 * https://opentelemetry.io/docs/specs/otel/logs/data-model/#field-severitynumber
 */
export const SEVERITY_LEVELS = {
  TRACE: { min: 1, max: 4, label: "Trace", shortLabel: "TRC" },
  DEBUG: { min: 5, max: 8, label: "Debug", shortLabel: "DBG" },
  INFO: { min: 9, max: 12, label: "Info", shortLabel: "INF" },
  WARN: { min: 13, max: 16, label: "Warn", shortLabel: "WRN" },
  ERROR: { min: 17, max: 20, label: "Error", shortLabel: "ERR" },
  FATAL: { min: 21, max: 24, label: "Fatal", shortLabel: "FTL" },
} as const;

export type SeverityLevel = keyof typeof SEVERITY_LEVELS;

/**
 * Badge variants for each severity level
 */
export type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

/**
 * Get severity level from severity number
 */
export function getSeverityLevel(severityNumber: number | null | undefined): SeverityLevel {
  if (severityNumber == null || severityNumber < 1) return "TRACE";
  if (severityNumber <= 4) return "TRACE";
  if (severityNumber <= 8) return "DEBUG";
  if (severityNumber <= 12) return "INFO";
  if (severityNumber <= 16) return "WARN";
  if (severityNumber <= 20) return "ERROR";
  return "FATAL";
}

/**
 * Get severity label for display
 */
export function getSeverityLabel(severityNumber: number | null | undefined): string {
  const level = getSeverityLevel(severityNumber);
  return SEVERITY_LEVELS[level].label;
}

/**
 * Get short severity label (3 chars)
 */
export function getSeverityShortLabel(severityNumber: number | null | undefined): string {
  const level = getSeverityLevel(severityNumber);
  return SEVERITY_LEVELS[level].shortLabel;
}

/**
 * Get badge variant for severity level
 */
export function getSeverityBadgeVariant(severityNumber: number | null | undefined): BadgeVariant {
  const level = getSeverityLevel(severityNumber);

  switch (level) {
    case "TRACE":
    case "DEBUG":
      return "secondary";
    case "INFO":
      return "default";
    case "WARN":
      return "outline";
    case "ERROR":
    case "FATAL":
      return "destructive";
    default:
      return "secondary";
  }
}

/**
 * Get CSS class for severity level coloring
 */
export function getSeverityColorClass(severityNumber: number | null | undefined): string {
  const level = getSeverityLevel(severityNumber);

  switch (level) {
    case "TRACE":
      return "text-muted-foreground";
    case "DEBUG":
      return "text-slate-500";
    case "INFO":
      return "text-blue-500";
    case "WARN":
      return "text-yellow-500";
    case "ERROR":
      return "text-red-500";
    case "FATAL":
      return "text-purple-500";
    default:
      return "text-muted-foreground";
  }
}

/**
 * Severity filter options for dropdown
 */
export const SEVERITY_FILTER_OPTIONS = [
  { value: "all", label: "All Levels", minSeverity: 0 },
  { value: "debug", label: "Debug+", minSeverity: 5 },
  { value: "info", label: "Info+", minSeverity: 9 },
  { value: "warn", label: "Warn+", minSeverity: 13 },
  { value: "error", label: "Error+", minSeverity: 17 },
] as const;

export type SeverityFilterValue = (typeof SEVERITY_FILTER_OPTIONS)[number]["value"];

/**
 * Get minimum severity number for filter value
 */
export function getMinSeverityForFilter(filter: SeverityFilterValue): number {
  const option = SEVERITY_FILTER_OPTIONS.find((o) => o.value === filter);
  return option?.minSeverity ?? 0;
}

/**
 * Format log timestamp for display
 */
export function formatLogTimestamp(timestamp: Date | string): string {
  const date = typeof timestamp === "string" ? new Date(timestamp) : timestamp;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

/**
 * Truncate log body for table display
 */
export function truncateLogBody(body: string | null | undefined, maxLength = 200): string {
  if (!body) return "";
  if (body.length <= maxLength) return body;
  return body.slice(0, maxLength) + "...";
}
