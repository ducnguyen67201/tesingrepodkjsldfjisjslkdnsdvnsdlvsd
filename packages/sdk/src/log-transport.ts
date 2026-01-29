/**
 * Log Transport for Ducsigr SDK
 *
 * Handles batching and sending logs to the ingest service in OTLP format.
 * Mirrors the Transport class pattern used for traces.
 */
import type { ResolvedConfig } from './types';
import type {
  LogData,
  OtlpLogsExportRequest,
  OtlpLogAttribute,
  OtlpLogAttributeValue,
  LogsIngestResponse,
} from './log-types';

/**
 * HTTP transport for sending logs to the ingest service
 */
export class LogTransport {
  private config: ResolvedConfig;
  private queue: LogData[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private isFlushing = false;

  constructor(config: ResolvedConfig) {
    this.config = config;
    this.startFlushTimer();
  }

  /**
   * Start the periodic flush timer
   */
  private startFlushTimer(): void {
    if (this.config.disabled) return;

    this.flushTimer = setInterval(() => {
      this.flush().catch((err) => {
        if (this.config.debug) {
          console.error('[Ducsigr] Log flush error:', err);
        }
      });
    }, this.config.flushInterval);

    // Don't prevent process exit
    if (this.flushTimer.unref) {
      this.flushTimer.unref();
    }
  }

  /**
   * Add a log to the queue for sending
   */
  enqueue(log: LogData): void {
    if (this.config.disabled) return;

    this.queue.push(log);

    if (this.config.debug) {
      console.log(
        `[Ducsigr] Queued log "${log.level}: ${log.message.substring(0, 50)}...", queue size: ${this.queue.length}`
      );
    }

    // Flush immediately if batch size reached
    if (this.queue.length >= this.config.maxBatchSize) {
      this.flush().catch((err) => {
        if (this.config.debug) {
          console.error('[Ducsigr] Log flush error:', err);
        }
      });
    }
  }

  /**
   * Flush all pending logs to the server
   */
  async flush(): Promise<void> {
    if (this.config.disabled || this.queue.length === 0 || this.isFlushing) {
      return;
    }

    this.isFlushing = true;
    const logs = this.queue.splice(0, this.config.maxBatchSize);

    if (this.config.debug) {
      console.log(`[Ducsigr] Flushing ${logs.length} log(s)`);
    }

    try {
      await this.sendLogs(logs);
    } catch (err) {
      // Put failed logs back in queue for retry
      this.queue.unshift(...logs);
      throw err;
    } finally {
      this.isFlushing = false;
    }
  }

  /**
   * Send logs to the server with retries
   */
  private async sendLogs(logs: LogData[]): Promise<LogsIngestResponse> {
    const payload = this.formatPayload(logs);

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      try {
        const response = await fetch(`${this.config.endpoint}/v1/logs`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.config.apiKey}`,
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const result = (await response.json()) as LogsIngestResponse;

        if (this.config.debug) {
          console.log(`[Ducsigr] Sent ${logs.length} log(s)`);
        }

        return result;
      } catch (err) {
        lastError = err as Error;

        if (this.config.debug) {
          console.warn(
            `[Ducsigr] Log retry ${attempt + 1}/${this.config.maxRetries}:`,
            err
          );
        }

        // Exponential backoff
        if (attempt < this.config.maxRetries - 1) {
          await this.sleep(Math.pow(2, attempt) * 100);
        }
      }
    }

    // All retries failed
    console.error(
      `[Ducsigr] Failed to send ${logs.length} log(s) after ${this.config.maxRetries} attempts:`,
      lastError
    );
    throw lastError;
  }

  /**
   * Format logs for the OTLP logs export API
   */
  private formatPayload(logs: LogData[]): OtlpLogsExportRequest {
    const now = Date.now() * 1_000_000; // Current time in nanoseconds

    return {
      resourceLogs: [
        {
          resource: {
            attributes: [
              {
                key: 'service.name',
                value: { stringValue: 'ducsigr-sdk' },
              },
            ],
          },
          scopeLogs: [
            {
              scope: {
                name: '@ducsigr/sdk',
                version: '0.1.0',
              },
              logRecords: logs.map((log) => ({
                timeUnixNano: log.timeUnixNano,
                observedTimeUnixNano: String(now),
                severityNumber: log.severityNumber,
                severityText: log.level,
                body: { stringValue: log.message },
                attributes: this.formatAttributes(log.attributes),
                ...(log.traceId && { traceId: log.traceId }),
                ...(log.spanId && { spanId: log.spanId }),
              })),
            },
          ],
        },
      ],
    };
  }

  /**
   * Convert SDK attributes to OTLP attribute format
   */
  private formatAttributes(
    attrs: Record<string, unknown>
  ): OtlpLogAttribute[] {
    return Object.entries(attrs).map(([key, value]) => ({
      key,
      value: this.formatAttributeValue(value),
    }));
  }

  /**
   * Convert a single value to OTLP attribute value format
   */
  private formatAttributeValue(value: unknown): OtlpLogAttributeValue {
    if (typeof value === 'string') {
      return { stringValue: value };
    }
    if (typeof value === 'number') {
      if (Number.isInteger(value)) {
        return { intValue: String(value) };
      }
      return { doubleValue: value };
    }
    if (typeof value === 'boolean') {
      return { boolValue: value };
    }
    if (Array.isArray(value)) {
      return {
        arrayValue: {
          values: value.map((v) => this.formatAttributeValue(v)),
        },
      };
    }
    if (value !== null && typeof value === 'object') {
      return {
        kvlistValue: {
          values: Object.entries(value as Record<string, unknown>).map(
            ([k, v]) => ({
              key: k,
              value: this.formatAttributeValue(v),
            })
          ),
        },
      };
    }
    // Fallback: convert to string
    return { stringValue: String(value) };
  }

  /**
   * Sleep for a given duration
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Shutdown the transport, flushing any pending data
   */
  async shutdown(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    // Final flush
    try {
      await this.flush();
    } catch (err) {
      if (this.config.debug) {
        console.error('[Ducsigr] Error during log shutdown flush:', err);
      }
    }
  }
}
