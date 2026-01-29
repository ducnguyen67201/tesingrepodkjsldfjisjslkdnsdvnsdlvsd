import { gzipSync } from 'node:zlib';
import type {
  ResolvedConfig,
  TraceData,
  SpanData,
  SpanLevel,
} from './types';

/**
 * OTLP Format Types (matching ingest service expectations)
 */
interface OtlpAttribute {
  key: string;
  value: {
    stringValue?: string;
    intValue?: string | number;
    doubleValue?: number;
    boolValue?: boolean;
  };
}

interface OtlpSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: number;
  startTimeUnixNano: string;
  endTimeUnixNano?: string;
  attributes?: OtlpAttribute[];
  status?: {
    code: number;
    message?: string;
  };
}

interface OtlpExportRequest {
  resourceSpans: Array<{
    resource?: {
      attributes?: OtlpAttribute[];
    };
    scopeSpans: Array<{
      scope?: {
        name?: string;
        version?: string;
      };
      spans: OtlpSpan[];
    }>;
  }>;
}

interface OtlpResponse {
  // OTLP response is typically empty on success
  partialSuccess?: {
    rejectedSpans?: number;
    errorMessage?: string;
  };
}

/**
 * HTTP transport for sending traces to the ingest service
 */
export class Transport {
  private config: ResolvedConfig;
  private queue: TraceData[] = [];
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
          console.error('[Ducsigr] Flush error:', err);
        }
      });
    }, this.config.flushInterval);

    // Don't prevent process exit
    if (this.flushTimer.unref) {
      this.flushTimer.unref();
    }
  }

  /**
   * Add a trace to the queue for sending
   */
  enqueue(trace: TraceData): void {
    if (this.config.disabled) return;

    // Sampling: skip trace based on sample rate
    if (this.config.sampleRate < 1.0 && Math.random() > this.config.sampleRate) {
      if (this.config.debug) {
        console.log(`[Ducsigr] Skipped trace "${trace.name}" (sampled out)`);
      }
      return;
    }

    // Queue overflow protection: drop oldest traces if queue is full
    while (this.queue.length >= this.config.maxQueueSize) {
      const dropped = this.queue.shift();
      if (dropped) {
        console.warn(
          `[Ducsigr] Queue full (${this.config.maxQueueSize}), dropped oldest trace: ${dropped.id}`
        );
      }
    }

    this.queue.push(trace);

    if (this.config.debug) {
      console.log(
        `[Ducsigr] Queued trace "${trace.name}" (${trace.id}), queue size: ${this.queue.length}`
      );
    }

    // Flush immediately if batch size reached
    if (this.queue.length >= this.config.maxBatchSize) {
      this.flush().catch((err) => {
        if (this.config.debug) {
          console.error('[Ducsigr] Flush error:', err);
        }
      });
    }
  }

  /**
   * Flush all pending traces to the server
   */
  async flush(): Promise<void> {
    if (this.config.disabled || this.queue.length === 0 || this.isFlushing) {
      return;
    }

    this.isFlushing = true;
    const traces = this.queue.splice(0, this.config.maxBatchSize);

    if (this.config.debug) {
      console.log(`[Ducsigr] Flushing ${traces.length} trace(s)`);
    }

    try {
      await Promise.all(traces.map((trace) => this.sendTrace(trace)));
    } catch (err) {
      // Put failed traces back in queue for retry
      this.queue.unshift(...traces);
      throw err;
    } finally {
      this.isFlushing = false;
    }
  }

  /**
   * Send a single trace to the server with retries
   */
  private async sendTrace(trace: TraceData): Promise<OtlpResponse> {
    const payload = this.formatOtlpPayload(trace);
    const jsonBody = JSON.stringify(payload);

    // Compress if enabled
    const body = this.config.compression
      ? gzipSync(Buffer.from(jsonBody))
      : jsonBody;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.config.apiKey}`,
    };

    if (this.config.compression) {
      headers['Content-Encoding'] = 'gzip';
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      try {
        const response = await fetch(`${this.config.endpoint}/v1/traces`, {
          method: 'POST',
          headers,
          body,
          signal: AbortSignal.timeout(this.config.timeout),
        });

        // Handle rate limiting (429)
        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After');
          const delay = retryAfter
            ? parseInt(retryAfter, 10) * 1000
            : Math.pow(2, attempt) * 1000;
          const cappedDelay = Math.min(delay, this.config.maxRetryDelay);

          if (this.config.debug) {
            console.warn(
              `[Ducsigr] Rate limited (429), retrying after ${cappedDelay}ms`
            );
          }

          await this.sleep(cappedDelay);
          continue;
        }

        // Don't retry on 4xx (except 429) - client errors are not transient
        if (response.status >= 400 && response.status < 500) {
          const errorText = await response.text();
          const error = new Error(`HTTP ${response.status}: ${errorText}`);
          // Mark as non-retryable so catch block doesn't retry
          (error as Error & { nonRetryable?: boolean }).nonRetryable = true;
          throw error;
        }

        // Retry on 5xx - server errors may be transient
        if (response.status >= 500) {
          const errorText = await response.text();
          lastError = new Error(`HTTP ${response.status}: ${errorText}`);

          if (this.config.debug) {
            console.warn(
              `[Ducsigr] Server error ${response.status}, retry ${attempt + 1}/${this.config.maxRetries}`
            );
          }

          // Exponential backoff for server errors
          if (attempt < this.config.maxRetries - 1) {
            const delay = Math.min(
              Math.pow(2, attempt) * 100,
              this.config.maxRetryDelay
            );
            await this.sleep(delay);
          }
          continue;
        }

        const result = (await response.json()) as OtlpResponse;

        if (this.config.debug) {
          console.log(
            `[Ducsigr] Sent trace ${trace.id} with ${trace.spans.length} span(s)`
          );
        }

        return result;
      } catch (err) {
        lastError = err as Error;

        // Don't retry non-retryable errors (4xx client errors)
        if (
          err instanceof Error &&
          (err as Error & { nonRetryable?: boolean }).nonRetryable
        ) {
          throw err;
        }

        // Check if it's a timeout error
        const isTimeoutError =
          err instanceof Error &&
          (err.name === 'TimeoutError' || err.name === 'AbortError');

        if (this.config.debug) {
          console.warn(
            `[Ducsigr] ${isTimeoutError ? 'Timeout' : 'Network error'}, retry ${attempt + 1}/${this.config.maxRetries}:`,
            err
          );
        }

        // Exponential backoff for network errors (including timeout)
        if (attempt < this.config.maxRetries - 1) {
          const delay = Math.min(
            Math.pow(2, attempt) * 100,
            this.config.maxRetryDelay
          );
          await this.sleep(delay);
        }
      }
    }

    // All retries failed
    console.error(
      `[Ducsigr] Failed to send trace ${trace.id} after ${this.config.maxRetries} attempts:`,
      lastError
    );
    throw lastError;
  }

  /**
   * Format trace data as OTLP ExportTraceServiceRequest
   */
  private formatOtlpPayload(trace: TraceData): OtlpExportRequest {
    // Build resource attributes (service info + SDK-specific metadata)
    const resourceAttrs: OtlpAttribute[] = [
      { key: 'service.name', value: { stringValue: trace.name } },
      { key: 'ducsigr.sdk.name', value: { stringValue: '@ducsigr/sdk' } },
      { key: 'ducsigr.sdk.version', value: { stringValue: '1.0.0' } },
    ];

    // Add session ID if present
    if (trace.sessionId) {
      resourceAttrs.push({
        key: 'ducsigr.session_id',
        value: { stringValue: trace.sessionId },
      });
    }

    // Add user ID if present
    if (trace.userId) {
      resourceAttrs.push({
        key: 'ducsigr.user_id',
        value: { stringValue: trace.userId },
      });
    }

    // Add user info if present
    if (trace.user) {
      if (trace.user.name) {
        resourceAttrs.push({
          key: 'ducsigr.user.name',
          value: { stringValue: trace.user.name },
        });
      }
      if (trace.user.email) {
        resourceAttrs.push({
          key: 'ducsigr.user.email',
          value: { stringValue: trace.user.email },
        });
      }
    }

    // Add trace metadata as resource attributes
    if (trace.metadata) {
      for (const [key, value] of Object.entries(trace.metadata)) {
        resourceAttrs.push(this.toOtlpAttribute(`ducsigr.metadata.${key}`, value));
      }
    }

    // Convert spans to OTLP format
    const otlpSpans: OtlpSpan[] = trace.spans.map((span) =>
      this.formatOtlpSpan(span, trace.id)
    );

    return {
      resourceSpans: [
        {
          resource: {
            attributes: resourceAttrs,
          },
          scopeSpans: [
            {
              scope: {
                name: '@ducsigr/sdk',
                version: '1.0.0',
              },
              spans: otlpSpans,
            },
          ],
        },
      ],
    };
  }

  /**
   * Format a single span as OTLP Span
   */
  private formatOtlpSpan(span: SpanData, traceId: string): OtlpSpan {
    const attributes: OtlpAttribute[] = [];

    // Add input as attribute
    if (span.input) {
      attributes.push({
        key: 'gen_ai.prompt',
        value: { stringValue: JSON.stringify(span.input) },
      });
    }

    // Add output as attribute
    if (span.output) {
      attributes.push({
        key: 'gen_ai.completion',
        value: { stringValue: JSON.stringify(span.output) },
      });
    }

    // Add model info
    if (span.model) {
      attributes.push({
        key: 'gen_ai.request.model',
        value: { stringValue: span.model },
      });
    }

    // Add model parameters
    if (span.modelParameters) {
      for (const [key, value] of Object.entries(span.modelParameters)) {
        attributes.push(
          this.toOtlpAttribute(`gen_ai.request.${key}`, value)
        );
      }
    }

    // Add token usage (GenAI semantic conventions)
    if (span.usage) {
      if (span.usage.promptTokens !== undefined) {
        attributes.push({
          key: 'gen_ai.usage.input_tokens',
          value: { intValue: span.usage.promptTokens },
        });
      }
      if (span.usage.completionTokens !== undefined) {
        attributes.push({
          key: 'gen_ai.usage.output_tokens',
          value: { intValue: span.usage.completionTokens },
        });
      }
    }

    // Add span metadata as attributes
    if (span.metadata) {
      for (const [key, value] of Object.entries(span.metadata)) {
        attributes.push(this.toOtlpAttribute(key, value));
      }
    }

    return {
      traceId,
      spanId: span.id,
      parentSpanId: span.parentSpanId ?? undefined,
      name: span.name,
      kind: 1, // SPAN_KIND_INTERNAL
      startTimeUnixNano: this.dateToNano(span.startTime),
      endTimeUnixNano: span.endTime ? this.dateToNano(span.endTime) : undefined,
      attributes: attributes.length > 0 ? attributes : undefined,
      status: {
        code: this.levelToStatusCode(span.level),
        message: span.statusMessage ?? undefined,
      },
    };
  }

  /**
   * Convert a value to OTLP attribute
   */
  private toOtlpAttribute(key: string, value: unknown): OtlpAttribute {
    if (typeof value === 'string') {
      return { key, value: { stringValue: value } };
    }
    if (typeof value === 'number') {
      if (Number.isInteger(value)) {
        return { key, value: { intValue: value } };
      }
      return { key, value: { doubleValue: value } };
    }
    if (typeof value === 'boolean') {
      return { key, value: { boolValue: value } };
    }
    // For objects/arrays, serialize to JSON string
    return { key, value: { stringValue: JSON.stringify(value) } };
  }

  /**
   * Convert Date to nanoseconds string (OTLP format)
   */
  private dateToNano(date: Date): string {
    return (BigInt(date.getTime()) * 1_000_000n).toString();
  }

  /**
   * Map SDK span level to OTLP status code
   * OTLP: 0=UNSET, 1=OK, 2=ERROR
   */
  private levelToStatusCode(level: SpanLevel): number {
    switch (level) {
      case 'ERROR':
        return 2;
      case 'WARNING':
      case 'DEBUG':
      case 'DEFAULT':
      default:
        return 1; // OK
    }
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
        console.error('[Ducsigr] Error during shutdown flush:', err);
      }
    }
  }
}
