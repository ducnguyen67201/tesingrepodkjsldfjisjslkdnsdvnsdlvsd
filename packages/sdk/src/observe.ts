import { Trace } from './trace';
import { extractLLMData } from './utils/extract-llm';
import {
  getActiveContext,
  runWithContext,
  type TracingContext,
} from './context';

/**
 * Options for observe()
 */
export interface ObserveOptions {
  /** Name of the span (defaults to 'observed-function') */
  name?: string;

  /**
   * Type of observation:
   * - 'generation' for LLM calls (auto-extracts tokens)
   * - 'span' for general operations (default)
   */
  type?: 'generation' | 'span';

  /** Custom metadata to attach */
  metadata?: Record<string, unknown>;

  /** Whether to capture input arguments (default: true) */
  captureInput?: boolean;

  /** Whether to capture output/return value (default: true) */
  captureOutput?: boolean;

  /** User ID for tracking */
  userId?: string;

  /** Session ID for grouping traces */
  sessionId?: string;
}

/**
 * Internal: Get or create trace context
 */
function getOrCreateContext(
  options: ObserveOptions,
  onTraceEnd: (data: import('./types').TraceData) => void
): { context: TracingContext; isRoot: boolean } {
  const existingContext = getActiveContext();

  if (existingContext) {
    // Nested call - reuse existing trace
    return { context: existingContext, isRoot: false };
  }

  // Root call - create new trace
  const trace = new Trace(
    {
      name: options.name ?? 'observed-trace',
      metadata: {
        ...options.metadata,
        ...(options.userId && { userId: options.userId }),
        ...(options.sessionId && { sessionId: options.sessionId }),
      },
    },
    onTraceEnd
  );

  return {
    context: { trace, span: null },
    isRoot: true,
  };
}

/**
 * Observe and trace an async function
 *
 * @example
 * ```typescript
 * // Simple usage
 * const result = await observe('fetch-user', async () => {
 *   return db.query('SELECT * FROM users WHERE id = ?', [userId]);
 * });
 *
 * // With options for LLM calls
 * const response = await observe({
 *   name: 'openai-completion',
 *   type: 'generation',
 * }, async () => {
 *   return openai.chat.completions.create({
 *     model: 'gpt-4',
 *     messages: [{ role: 'user', content: 'Hello' }],
 *   });
 * });
 *
 * // Auto-nesting works automatically
 * await observe('parent', async () => {
 *   await observe('child-1', async () => { ... });
 *   await observe('child-2', async () => { ... });
 * });
 * ```
 */
export function createObserve(
  onTraceEnd: (data: import('./types').TraceData) => void,
  debug: boolean = false
) {
  return async function observe<T>(
    nameOrOptions: string | ObserveOptions,
    fn: () => Promise<T>
  ): Promise<T> {
    // Normalize options
    const options: ObserveOptions =
      typeof nameOrOptions === 'string'
        ? { name: nameOrOptions }
        : nameOrOptions;

    const spanName = options.name ?? 'observed-function';
    const captureOutput = options.captureOutput ?? true;
    const isGeneration = options.type === 'generation';

    // Get or create trace context
    const { context, isRoot } = getOrCreateContext(options, onTraceEnd);
    const { trace } = context;

    // Create span (auto-parented to current span)
    const parentSpanId = context.span?.id;
    const span = trace.startSpan({
      name: spanName,
      parentSpanId,
      metadata: options.metadata,
    });

    if (debug) {
      console.log(
        `[Ducsigr] observe("${spanName}") started, parent=${parentSpanId ?? 'root'}`
      );
    }

    // Update context with new span
    const newContext: TracingContext = { trace, span };

    try {
      // Run function with updated context
      const result = await runWithContext(newContext, fn);

      // Capture output if enabled
      if (captureOutput && result !== undefined) {
        // For LLM calls, extract usage and model info
        if (isGeneration) {
          const llmData = extractLLMData(result);
          if (llmData.model) {
            span.setModel(
              llmData.model,
              llmData.modelParameters ?? undefined
            );
          }
          if (llmData.usage) {
            span.setUsage(llmData.usage);
          }
          if (llmData.output) {
            span.setOutput(llmData.output);
          }
        } else {
          // For regular spans, capture the full result
          if (typeof result === 'object' && result !== null) {
            span.setOutput(result as Record<string, unknown>);
          } else {
            span.setOutput({ value: result });
          }
        }
      }

      span.end();

      // If this is the root, end the trace
      if (isRoot) {
        trace.end();
      }

      if (debug) {
        console.log(
          `[Ducsigr] observe("${spanName}") completed in ${span.duration}ms`
        );
      }

      return result;
    } catch (error) {
      // Capture error
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      span.setError(errorMessage);
      span.end();

      // If this is the root, end the trace
      if (isRoot) {
        trace.end();
      }

      if (debug) {
        console.log(`[Ducsigr] observe("${spanName}") failed: ${errorMessage}`);
      }

      throw error;
    }
  };
}

/**
 * Options for observeSync() - synchronous version
 */
export function createObserveSync(
  onTraceEnd: (data: import('./types').TraceData) => void,
  _debug: boolean = false
) {
  return function observeSync<T>(
    nameOrOptions: string | ObserveOptions,
    fn: () => T
  ): T {
    // Normalize options
    const options: ObserveOptions =
      typeof nameOrOptions === 'string'
        ? { name: nameOrOptions }
        : nameOrOptions;

    const spanName = options.name ?? 'observed-function';
    const captureOutput = options.captureOutput ?? true;

    // Get or create trace context
    const { context, isRoot } = getOrCreateContext(options, onTraceEnd);
    const { trace } = context;

    // Create span
    const parentSpanId = context.span?.id;
    const span = trace.startSpan({
      name: spanName,
      parentSpanId,
      metadata: options.metadata,
    });

    // Update context with new span
    const newContext: TracingContext = { trace, span };

    try {
      // Run function with updated context
      const result = runWithContext(newContext, fn);

      if (captureOutput && result !== undefined) {
        if (typeof result === 'object' && result !== null) {
          span.setOutput(result as Record<string, unknown>);
        } else {
          span.setOutput({ value: result });
        }
      }

      span.end();

      if (isRoot) {
        trace.end();
      }

      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      span.setError(errorMessage);
      span.end();

      if (isRoot) {
        trace.end();
      }

      throw error;
    }
  };
}
