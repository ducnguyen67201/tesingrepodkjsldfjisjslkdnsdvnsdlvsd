// Shared utility functions

/**
 * Generate a random ID (similar to cuid)
 */
export function generateId(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 15);
  return `${timestamp}${randomPart}`;
}

/**
 * Sleep for a given number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
  } = {}
): Promise<T> {
  const { maxAttempts = 3, initialDelayMs = 100, maxDelayMs = 5000 } = options;

  let lastError: Error | undefined;
  let delay = initialDelayMs;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (attempt === maxAttempts) break;

      await sleep(delay);
      delay = Math.min(delay * 2, maxDelayMs);
    }
  }

  throw lastError;
}

/**
 * Safely parse JSON with a fallback
 */
export function safeJsonParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

/**
 * Convert a timestamp to ISO string, handling various input types
 */
export function toISOString(
  timestamp: Date | string | number | undefined
): string | undefined {
  if (!timestamp) return undefined;

  if (timestamp instanceof Date) {
    return timestamp.toISOString();
  }

  if (typeof timestamp === "string") {
    return new Date(timestamp).toISOString();
  }

  if (typeof timestamp === "number") {
    return new Date(timestamp).toISOString();
  }

  return undefined;
}

/** Default max characters for code content in AI prompts */
const DEFAULT_MAX_CODE_LENGTH = 2000;

/**
 * Truncate code content to prevent overly large AI prompts.
 * Useful across multiple AI workflows that embed code context.
 */
export function truncateCodeContent(
  content: string,
  maxLength: number = DEFAULT_MAX_CODE_LENGTH
): string {
  if (content.length <= maxLength) {
    return content;
  }
  return content.slice(0, maxLength) + "\n// ... truncated ...";
}

/**
 * Formats a file size in bytes to a human-readable string.
 * - Under 1KB: displays in bytes (e.g., "500 B")
 * - Under 1MB: displays in KB (e.g., "2.5 KB")
 * - 1MB or more: displays in MB (e.g., "1.5 MB")
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
