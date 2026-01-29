/**
 * Regression Template
 *
 * Shared template for building regression notification content.
 * Used by Discord, Slack, Gmail adapters for consistent messaging.
 */

import {
  type RegressionInfo,
  REGRESSION_METRIC_LABELS,
  formatRegressionValue,
} from "../../schemas/alerting";

/**
 * Normalized regression detail for adapter consumption
 */
export interface RegressionDetailContent {
  /** Display label (e.g., "P95 Latency") */
  label: string;
  /** Human-readable message */
  message: string;
  /** Formatted baseline value */
  baselineFormatted: string;
  /** Formatted current value */
  currentFormatted: string;
  /** Change percentage */
  changePercent: number;
}

/**
 * Normalized regression content for adapter consumption
 */
export interface RegressionContent {
  /** Header text (e.g., "Performance Regression Detected") */
  header: string;
  /** Trigger reference text (e.g., "After: PR #123") or null */
  triggerText: string | null;
  /** Array of regression details */
  details: RegressionDetailContent[];
  /** Footer text for attribution */
  footer: string;
}

/**
 * Build normalized regression content from RegressionInfo
 *
 * @param regressionInfo - Raw regression info from alert payload
 * @returns Normalized content for adapter consumption
 *
 * @example
 * ```ts
 * const content = buildRegressionContent(payload.regressionInfo);
 * // content.header = "Performance Regression Detected"
 * // content.triggerText = "After: PR #123"
 * // content.details = [{ label: "P95 Latency", message: "...", ... }]
 * ```
 */
export function buildRegressionContent(regressionInfo: RegressionInfo): RegressionContent {
  const header = "Performance Regression Detected";

  const triggerText = regressionInfo.triggerRef
    ? `After: ${regressionInfo.triggerRef}`
    : null;

  const details: RegressionDetailContent[] = regressionInfo.details.map((detail) => ({
    label: REGRESSION_METRIC_LABELS[detail.metric] ?? detail.metric,
    message: detail.message,
    baselineFormatted: formatRegressionValue(detail.metric, detail.baseline),
    currentFormatted: formatRegressionValue(detail.metric, detail.current),
    changePercent: detail.changePercent,
  }));

  const footer = "Eval Pipeline Regression Detection by Ducsigr";

  return { header, triggerText, details, footer };
}
