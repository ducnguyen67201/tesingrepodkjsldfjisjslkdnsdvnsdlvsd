/**
 * Logger Client for CognObserve SDK
 *
 * Provides structured logging that integrates with traces and spans.
 * Logs are sent to the ingest service in OTLP format.
 */
import { LogTransport } from './log-transport';
import { getActiveContext } from './context';
import type { ResolvedConfig } from './types';
import type { LogLevel, LogData } from './log-types';
import { SEVERITY_NUMBERS } from './log-types';

/**
 * Logger client for sending structured logs
 */
export class LoggerClient {
  private transport: LogTransport;
  private config: ResolvedConfig;

  constructor(config: ResolvedConfig) {
    this.config = config;
    this.transport = new LogTransport(config);
  }

  /**
   * Log a message at TRACE level
   */
  trace(message: string, attributes?: Record<string, unknown>): void {
    this.log('TRACE', message, attributes);
  }

  /**
   * Log a message at DEBUG level
   */
  debug(message: string, attributes?: Record<string, unknown>): void {
    this.log('DEBUG', message, attributes);
  }

  /**
   * Log a message at INFO level
   */
  info(message: string, attributes?: Record<string, unknown>): void {
    this.log('INFO', message, attributes);
  }

  /**
   * Log a message at WARN level
   */
  warn(message: string, attributes?: Record<string, unknown>): void {
    this.log('WARN', message, attributes);
  }

  /**
   * Log a message at ERROR level
   */
  error(message: string, attributes?: Record<string, unknown>): void {
    this.log('ERROR', message, attributes);
  }

  /**
   * Log a message at FATAL level
   */
  fatal(message: string, attributes?: Record<string, unknown>): void {
    this.log('FATAL', message, attributes);
  }

  /**
   * Log a message at the specified level
   *
   * @example
   * ```typescript
   * CognObserve.logs.log('INFO', 'User logged in', { userId: '123' });
   * CognObserve.logs.log('ERROR', 'Payment failed', { orderId: 'abc', reason: 'timeout' });
   * ```
   */
  log(
    level: LogLevel,
    message: string,
    attributes?: Record<string, unknown>
  ): void {
    if (this.config.disabled) return;

    const now = Date.now();
    const record = this.createLogRecord(level, message, now, attributes);

    if (this.config.debug) {
      console.log(
        `[CognObserve] Log: ${level} - ${message}`,
        attributes ?? ''
      );
    }

    this.transport.enqueue(record);
  }

  /**
   * Create a log record with trace context auto-attached
   */
  private createLogRecord(
    level: LogLevel,
    message: string,
    timestampMs: number,
    attributes?: Record<string, unknown>
  ): LogData {
    // Get trace/span context if available
    const context = getActiveContext();
    let traceId: string | undefined;
    let spanId: string | undefined;

    if (context) {
      traceId = context.trace?.id;
      spanId = context.span?.id;
    }

    return {
      message,
      level,
      severityNumber: SEVERITY_NUMBERS[level],
      timeUnixNano: String(timestampMs * 1_000_000), // Convert ms to nanoseconds
      attributes: attributes ?? {},
      traceId,
      spanId,
    };
  }

  /**
   * Flush pending logs to the server
   */
  async flush(): Promise<void> {
    await this.transport.flush();
  }

  /**
   * Shutdown the logger, flushing pending logs
   */
  async shutdown(): Promise<void> {
    await this.transport.shutdown();
  }
}
