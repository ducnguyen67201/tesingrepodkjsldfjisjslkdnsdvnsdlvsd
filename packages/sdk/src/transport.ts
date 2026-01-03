import { gzipSync } from 'node:zlib';
import type {
  ResolvedConfig,
  TraceData,
  IngestRequest,
  IngestResponse,
} from './types';

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
  private async sendTrace(trace: TraceData): Promise<IngestResponse> {
    const payload = this.formatPayload(trace);
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

        const result = (await response.json()) as IngestResponse;

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
   * Format trace data for the ingest API
   */
  private formatPayload(trace: TraceData): IngestRequest {
    // Build user object for ingest (excludes 'id' as it goes in user_id)
    const user = trace.user
      ? {
          name: trace.user.name,
          email: trace.user.email,
          ...Object.fromEntries(
            Object.entries(trace.user).filter(
              ([key]) => !['id', 'name', 'email'].includes(key)
            )
          ),
        }
      : undefined;

    return {
      trace_id: trace.id,
      session_id: trace.sessionId ?? undefined,
      user_id: trace.userId ?? undefined,
      user: user,
      name: trace.name,
      metadata: trace.metadata ?? undefined,
      spans: trace.spans.map((span) => ({
        span_id: span.id,
        parent_span_id: span.parentSpanId ?? undefined,
        name: span.name,
        start_time: span.startTime.toISOString(),
        end_time: span.endTime?.toISOString(),
        input: span.input ?? undefined,
        output: span.output ?? undefined,
        metadata: span.metadata ?? undefined,
        model: span.model ?? undefined,
        model_parameters: span.modelParameters ?? undefined,
        usage: span.usage
          ? {
              prompt_tokens: span.usage.promptTokens,
              completion_tokens: span.usage.completionTokens,
              total_tokens: span.usage.totalTokens,
            }
          : undefined,
        level: span.level,
        status_message: span.statusMessage ?? undefined,
      })),
    };
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
