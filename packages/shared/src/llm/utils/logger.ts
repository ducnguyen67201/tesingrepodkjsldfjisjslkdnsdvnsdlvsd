/**
 * LLM Center - Configurable Logger
 *
 * Simple logger that can be enabled/disabled via configuration.
 * Centralizes all LLM-related logging for easy control in production.
 */

// ============================================
// Types
// ============================================

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LoggerConfig {
  /** Enable/disable logging (default: true in development) */
  enabled?: boolean;
  /** Minimum log level to output */
  level?: LogLevel;
  /** Custom log handler (default: console) */
  handler?: (level: LogLevel, message: string, meta?: Record<string, unknown>) => void;
}

// ============================================
// Constants
// ============================================

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const DEFAULT_CONFIG: Required<Omit<LoggerConfig, "handler">> = {
  enabled: process.env.NODE_ENV !== "production",
  level: "info",
};

// ============================================
// Logger Class
// ============================================

/**
 * Configurable logger for LLM operations.
 *
 * @example
 * ```typescript
 * const logger = createLogger({ enabled: true, level: "debug" });
 * logger.info("[Embedding] Starting batch", { count: 10 });
 * logger.error("[Search] Failed", { error: err.message });
 * ```
 */
export class Logger {
  private config: Required<Omit<LoggerConfig, "handler">> & { handler?: LoggerConfig["handler"] };

  constructor(config: LoggerConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.log("debug", message, meta);
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.log("info", message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.log("warn", message, meta);
  }

  error(message: string, meta?: Record<string, unknown>): void {
    this.log("error", message, meta);
  }

  private log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    if (!this.config.enabled) return;
    if (LOG_LEVELS[level] < LOG_LEVELS[this.config.level]) return;

    if (this.config.handler) {
      this.config.handler(level, message, meta);
      return;
    }

    // Default: use console
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : "";
    switch (level) {
      case "debug":
        console.debug(`[LLM] ${message}${metaStr}`);
        break;
      case "info":
        console.log(`[LLM] ${message}${metaStr}`);
        break;
      case "warn":
        console.warn(`[LLM] ${message}${metaStr}`);
        break;
      case "error":
        console.error(`[LLM] ${message}${metaStr}`);
        break;
    }
  }
}

// ============================================
// Factory & Singleton
// ============================================

let defaultLogger: Logger | null = null;

/**
 * Create a new logger instance.
 */
export function createLogger(config?: LoggerConfig): Logger {
  return new Logger(config);
}

/**
 * Get or create the default logger instance.
 */
export function getLogger(): Logger {
  if (!defaultLogger) {
    defaultLogger = new Logger();
  }
  return defaultLogger;
}

/**
 * Configure the default logger.
 */
export function configureLogger(config: LoggerConfig): void {
  defaultLogger = new Logger(config);
}
