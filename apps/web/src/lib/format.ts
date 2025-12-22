/**
 * Formatting utilities for trace data display.
 */

/**
 * Formats duration in milliseconds to a human-readable string.
 * - Under 1 second: displays in milliseconds (e.g., "500ms")
 * - Under 1 minute: displays in seconds (e.g., "2.50s")
 * - 1 minute or more: displays in minutes (e.g., "1.50m")
 */
export const formatDuration = (ms: number | null): string => {
  if (ms === null) return "-";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  return `${(ms / 60000).toFixed(2)}m`;
};

/**
 * Formats token count to a human-readable string.
 * - Under 1000: displays the raw number
 * - 1000 or more: displays with 'k' suffix (e.g., "5.0k")
 */
export const formatTokens = (tokens: number | null): string => {
  if (tokens === null) return "-";
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}k`;
  return tokens.toLocaleString();
};

/**
 * Formats a timestamp to a localized date/time string.
 */
export const formatTimestamp = (timestamp: string): string => {
  const date = new Date(timestamp);
  return date.toLocaleString();
};

/**
 * Formats a cost value to a human-readable currency string.
 * - $0.00 for zero
 * - $X.XK for >= 1000
 * - $X.XX for >= 1
 * - $X.XXX for >= 0.01
 * - $X.XXXX for < 0.01
 */
export const formatCost = (cost: number): string => {
  if (cost === 0) return "$0.00";
  if (cost >= 1000) return `$${(cost / 1000).toFixed(1)}K`;
  if (cost >= 1) return `$${cost.toFixed(2)}`;
  if (cost >= 0.01) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(4)}`;
};

// Re-export formatFileSize from shared utils
export { formatFileSize } from "@cognobserve/shared";
