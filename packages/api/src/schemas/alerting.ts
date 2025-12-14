/**
 * Alerting Schemas
 *
 * Zod schemas for alerting system - source of truth for types.
 */

import { z } from "zod";

/**
 * Alert types - metrics that can be monitored
 */
export const AlertTypeSchema = z.enum([
  "ERROR_RATE",
  "LATENCY_P50",
  "LATENCY_P95",
  "LATENCY_P99",
]);
export type AlertType = z.infer<typeof AlertTypeSchema>;

/**
 * Alert operators - comparison operators for thresholds
 */
export const AlertOperatorSchema = z.enum(["GREATER_THAN", "LESS_THAN"]);
export type AlertOperator = z.infer<typeof AlertOperatorSchema>;

/**
 * Alert severity levels - determines timing configuration
 */
export const AlertSeveritySchema = z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]);
export type AlertSeverity = z.infer<typeof AlertSeveritySchema>;

/**
 * Alert states - lifecycle state machine
 */
export const AlertStateSchema = z.enum([
  "INACTIVE",
  "PENDING",
  "FIRING",
  "RESOLVED",
]);
export type AlertState = z.infer<typeof AlertStateSchema>;

/**
 * Threshold presets - predefined thresholds for common use cases
 */
export const ThresholdPresetSchema = z.enum([
  "AGGRESSIVE",
  "BALANCED",
  "CONSERVATIVE",
]);
export type ThresholdPreset = z.infer<typeof ThresholdPresetSchema>;

/**
 * Channel providers - notification channels
 */
export const ChannelProviderSchema = z.enum([
  "GMAIL",
  "DISCORD",
  "SLACK",
  "PAGERDUTY",
  "WEBHOOK",
]);
export type ChannelProvider = z.infer<typeof ChannelProviderSchema>;

/**
 * All possible channel providers (derived from schema)
 */
export const CHANNEL_PROVIDERS = ChannelProviderSchema.options;

/**
 * Provider-specific config schemas
 */
export const GmailConfigSchema = z.object({
  email: z.string().email("Invalid email address"),
});
export type GmailConfig = z.infer<typeof GmailConfigSchema>;

export const DiscordConfigSchema = z.object({
  webhookUrl: z
    .string()
    .url("Invalid URL")
    .refine(
      (url) => url.startsWith("https://discord.com/api/webhooks/"),
      "Must be a Discord webhook URL"
    ),
});
export type DiscordConfig = z.infer<typeof DiscordConfigSchema>;

export const SlackConfigSchema = z.object({
  webhookUrl: z
    .string()
    .url("Invalid URL")
    .refine(
      (url) => url.startsWith("https://hooks.slack.com/"),
      "Must be a Slack webhook URL"
    ),
});
export type SlackConfig = z.infer<typeof SlackConfigSchema>;

export const WebhookConfigSchema = z.object({
  url: z.string().url("Invalid URL"),
  secret: z.string().optional(),
});
export type WebhookConfig = z.infer<typeof WebhookConfigSchema>;

/**
 * Alert notification payload - sent to adapters
 * Extended with optional RCA enrichment
 */
export const AlertPayloadSchema = z.object({
  alertId: z.string(),
  alertName: z.string(),
  projectId: z.string(),
  projectName: z.string(),
  type: AlertTypeSchema,
  threshold: z.number(),
  actualValue: z.number(),
  operator: AlertOperatorSchema,
  triggeredAt: z.string().datetime(),
  dashboardUrl: z.string().url().optional(),
  /** Optional RCA enrichment - populated when RCA is available */
  rca: z.lazy(() => RCASummarySchema).optional(),
});
export type AlertPayload = z.infer<typeof AlertPayloadSchema>;

/**
 * Metric result from MetricsService
 */
export const MetricResultSchema = z.object({
  value: z.number(),
  sampleCount: z.number(),
  windowStart: z.date(),
  windowEnd: z.date(),
});
export type MetricResult = z.infer<typeof MetricResultSchema>;

/**
 * Send result from AlertingAdapter
 */
export const SendResultSchema = z.object({
  success: z.boolean(),
  provider: ChannelProviderSchema,
  error: z.string().optional(),
  messageId: z.string().optional(),
});
export type SendResult = z.infer<typeof SendResultSchema>;

/**
 * Type labels for display
 */
export const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  ERROR_RATE: "Error Rate",
  LATENCY_P50: "Latency (P50)",
  LATENCY_P95: "Latency (P95)",
  LATENCY_P99: "Latency (P99)",
};

/**
 * Format value based on alert type
 */
export function formatAlertValue(type: AlertType, value: number): string {
  if (type === "ERROR_RATE") {
    return `${value.toFixed(2)}%`;
  }
  return `${value.toFixed(0)}ms`;
}

/**
 * Get operator symbol
 */
export function getOperatorSymbol(operator: AlertOperator): string {
  return operator === "GREATER_THAN" ? ">" : "<";
}

// ============================================================
// Severity & Preset Configuration Constants
// ============================================================

/**
 * Severity-based timing defaults
 *
 * - cooldownMins: Minimum time between notifications
 * - pendingMins: Condition must persist before firing
 * - evalIntervalMs: How often to evaluate this severity level
 * - flushIntervalMs: How often to flush the dispatch queue
 */
export const SEVERITY_DEFAULTS: Record<
  AlertSeverity,
  {
    cooldownMins: number;
    pendingMins: number;
    evalIntervalMs: number;
    flushIntervalMs: number;
  }
> = {
  CRITICAL: {
    cooldownMins: 5,
    pendingMins: 1,
    evalIntervalMs: 10_000,
    flushIntervalMs: 10_000,
  },
  HIGH: {
    cooldownMins: 30,
    pendingMins: 2,
    evalIntervalMs: 30_000,
    flushIntervalMs: 30_000,
  },
  MEDIUM: {
    cooldownMins: 120,
    pendingMins: 3,
    evalIntervalMs: 60_000,
    flushIntervalMs: 60_000,
  },
  LOW: {
    cooldownMins: 720,
    pendingMins: 5,
    evalIntervalMs: 300_000,
    flushIntervalMs: 300_000,
  },
} as const;

/**
 * Threshold presets - industry-standard defaults
 *
 * - AGGRESSIVE: Quick detection, more alerts (dev/staging)
 * - BALANCED: Recommended for production
 * - CONSERVATIVE: Reduce noise (high-traffic)
 */
export const THRESHOLD_PRESETS: Record<
  ThresholdPreset,
  {
    errorRate: number;
    latencyP50: number;
    latencyP95: number;
    latencyP99: number;
  }
> = {
  AGGRESSIVE: {
    errorRate: 1,
    latencyP50: 100,
    latencyP95: 500,
    latencyP99: 1000,
  },
  BALANCED: {
    errorRate: 5,
    latencyP50: 200,
    latencyP95: 1000,
    latencyP99: 2000,
  },
  CONSERVATIVE: {
    errorRate: 10,
    latencyP50: 500,
    latencyP95: 2000,
    latencyP99: 5000,
  },
} as const;

/**
 * Severity labels for UI display
 */
export const SEVERITY_LABELS: Record<AlertSeverity, string> = {
  CRITICAL: "Critical (P1)",
  HIGH: "High (P2)",
  MEDIUM: "Medium (P3)",
  LOW: "Low (P4)",
};

/**
 * State labels for UI display
 */
export const STATE_LABELS: Record<AlertState, string> = {
  INACTIVE: "Inactive",
  PENDING: "Pending",
  FIRING: "Firing",
  RESOLVED: "Resolved",
};

/**
 * Preset labels for UI display
 */
export const PRESET_LABELS: Record<ThresholdPreset, string> = {
  AGGRESSIVE: "Aggressive",
  BALANCED: "Balanced",
  CONSERVATIVE: "Conservative",
};

// ============================================================
// Queue Item Schema (for batch dispatch)
// ============================================================

/**
 * Trigger queue item - enqueued when alert transitions to FIRING
 */
export const TriggerQueueItemSchema = z.object({
  alertId: z.string(),
  alertName: z.string(),
  projectId: z.string(),
  projectName: z.string(),
  severity: AlertSeveritySchema,
  metricType: AlertTypeSchema,
  threshold: z.number(),
  actualValue: z.number(),
  operator: AlertOperatorSchema,
  previousState: AlertStateSchema,
  newState: AlertStateSchema,
  queuedAt: z.date(),
  channelIds: z.array(z.string()),
});
export type TriggerQueueItem = z.infer<typeof TriggerQueueItemSchema>;

/**
 * Dispatch result - returned from IDispatcher
 */
export const DispatchResultSchema = z.object({
  success: z.boolean(),
  sent: z.number(),
  failed: z.number(),
  errors: z.array(z.string()).optional(),
});
export type DispatchResult = z.infer<typeof DispatchResultSchema>;

// ============================================================
// RCA NOTIFICATION PAYLOAD
// ============================================================

/**
 * RCA root cause categories for notifications
 */
export const RCACategorySchema = z.enum([
  "CODE_CHANGE",
  "INFRASTRUCTURE",
  "EXTERNAL_DEPENDENCY",
  "DATA_ISSUE",
  "CONFIGURATION",
  "UNKNOWN",
]);
export type RCACategory = z.infer<typeof RCACategorySchema>;

/**
 * RCA relevance levels
 */
export const RCARelevanceSchema = z.enum(["high", "medium", "low"]);
export type RCARelevance = z.infer<typeof RCARelevanceSchema>;

/**
 * Top change (commit/PR) related to the incident
 */
export const RCATopChangeSchema = z.object({
  /** Change identifier (SHA or PR number) */
  id: z.string(),
  /** Type of change */
  type: z.enum(["commit", "pr"]),
  /** Short description (commit message or PR title, truncated) */
  summary: z.string().max(100),
  /** Author name */
  author: z.string(),
  /** Relevance level */
  relevance: RCARelevanceSchema,
});
export type RCATopChange = z.infer<typeof RCATopChangeSchema>;

/**
 * RCA summary for alert notifications
 */
export const RCASummarySchema = z.object({
  /** One-sentence hypothesis */
  hypothesis: z.string(),
  /** Confidence score (0-1) */
  confidence: z.number().min(0).max(1),
  /** Root cause category */
  category: RCACategorySchema,
  /** Top suspected change (optional) */
  topChange: RCATopChangeSchema.optional(),
  /** Immediate remediation steps (max 3) */
  remediation: z.array(z.string()).max(3),
  /** URL to full RCA detail page */
  detailUrl: z.string().url(),
});
export type RCASummary = z.infer<typeof RCASummarySchema>;

/**
 * Confidence level thresholds (percentage)
 */
export const CONFIDENCE_THRESHOLDS = {
  HIGH: 80,
  MEDIUM: 50,
} as const;

/**
 * Format confidence as percentage with label
 */
export function formatConfidence(confidence: number): string {
  const pct = Math.round(confidence * 100);
  if (pct >= CONFIDENCE_THRESHOLDS.HIGH) return `${pct}% (High)`;
  if (pct >= CONFIDENCE_THRESHOLDS.MEDIUM) return `${pct}% (Medium)`;
  return `${pct}% (Low)`;
}

/**
 * Category labels for display
 */
export const RCA_CATEGORY_LABELS: Record<RCACategory, string> = {
  CODE_CHANGE: "Code Change",
  INFRASTRUCTURE: "Infrastructure",
  EXTERNAL_DEPENDENCY: "External Dependency",
  DATA_ISSUE: "Data Issue",
  CONFIGURATION: "Configuration",
  UNKNOWN: "Unknown",
};

/**
 * Category icons (emoji) for display
 */
export const RCA_CATEGORY_ICONS: Record<RCACategory, string> = {
  CODE_CHANGE: "💻",
  INFRASTRUCTURE: "🏗️",
  EXTERNAL_DEPENDENCY: "🔗",
  DATA_ISSUE: "📊",
  CONFIGURATION: "⚙️",
  UNKNOWN: "❓",
};
