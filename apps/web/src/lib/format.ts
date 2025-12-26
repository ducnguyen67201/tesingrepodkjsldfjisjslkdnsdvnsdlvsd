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

/**
 * Formats a number to a human-readable string with K/M suffixes.
 * - Under 1000: displays the raw number
 * - 1000-999999: displays with 'K' suffix (e.g., "1.5K")
 * - 1000000+: displays with 'M' suffix (e.g., "2.3M")
 */
export const formatNumber = (num: number): string => {
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1)}M`;
  }
  if (num >= 1_000) {
    return `${(num / 1_000).toFixed(1)}K`;
  }
  return num.toString();
};

/**
 * Formats latency in milliseconds to a human-readable string.
 * - Under 1 second: displays in milliseconds (e.g., "500ms")
 * - 1 second or more: displays in seconds (e.g., "1.5s")
 */
export const formatLatency = (ms: number): string => {
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  return `${Math.round(ms)}ms`;
};

/**
 * Formats a date to a relative time string.
 * - Under 1 minute: "just now"
 * - Under 1 hour: "Xm ago"
 * - Under 24 hours: "Xh ago"
 * - Under 7 days: "Xd ago"
 * - Otherwise: formatted date (e.g., "Dec 25")
 */
export const formatRelativeTime = (date: Date): string => {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
};

// Re-export formatFileSize from shared utils
export { formatFileSize } from "@cognobserve/shared";
