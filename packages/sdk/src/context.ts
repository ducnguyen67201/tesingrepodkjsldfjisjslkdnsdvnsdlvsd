import { AsyncLocalStorage } from 'node:async_hooks';
import type { Trace } from './trace';
import type { Span } from './span';

/**
 * Context stored in AsyncLocalStorage for automatic propagation
 */
export interface TracingContext {
  trace: Trace;
  span: Span | null;
}

// AsyncLocalStorage for automatic context propagation
const asyncContext = new AsyncLocalStorage<TracingContext>();

/**
 * Run a function with a specific tracing context
 */
export function runWithContext<T>(context: TracingContext, fn: () => T): T {
  return asyncContext.run(context, fn);
}

/**
 * Get the current tracing context
 */
export function getActiveContext(): TracingContext | undefined {
  return asyncContext.getStore();
}

/**
 * Get the currently active trace from async context
 */
export function getActiveTrace(): Trace | undefined {
  return asyncContext.getStore()?.trace;
}

/**
 * Get the currently active span from async context
 */
export function getActiveSpan(): Span | undefined {
  return asyncContext.getStore()?.span ?? undefined;
}

/**
 * Set the active span in the current context
 */
export function setActiveSpan(span: Span | null): void {
  const context = asyncContext.getStore();
  if (context) {
    context.span = span;
  }
}
