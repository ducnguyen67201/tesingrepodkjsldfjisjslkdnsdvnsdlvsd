import { Span } from './span';
import { generateId } from './utils/id';
import type { TraceOptions, SpanOptions, TraceData, UserInfo } from './types';

/**
 * Represents a complete trace containing multiple spans
 */
export class Trace {
  readonly id: string;
  readonly name: string;
  readonly sessionId: string | null;
  readonly userId: string | null;
  readonly user: UserInfo | null;
  readonly timestamp: Date;
  readonly metadata: Record<string, unknown> | null;

  private _spans: Map<string, Span> = new Map();
  private _activeSpan: Span | null = null;
  private _ended = false;
  private _onEnd: ((data: TraceData) => void) | null = null;

  constructor(options: TraceOptions, onEnd?: (data: TraceData) => void) {
    this.id = options.id ?? generateId();
    this.name = options.name;
    this.sessionId = options.sessionId ?? null;
    this.userId = options.userId ?? options.user?.id ?? null;
    this.user = options.user ?? null;
    this.timestamp = new Date();
    this.metadata = options.metadata ?? null;
    this._onEnd = onEnd ?? null;
  }

  /**
   * Whether this trace has been ended
   */
  get isEnded(): boolean {
    return this._ended;
  }

  /**
   * Number of spans in this trace
   */
  get spanCount(): number {
    return this._spans.size;
  }

  /**
   * Currently active span (last started, not ended)
   */
  get activeSpan(): Span | null {
    return this._activeSpan;
  }

  /**
   * Start a new span within this trace
   */
  startSpan(options: SpanOptions): Span {
    if (this._ended) {
      throw new Error(
        `[Ducsigr] Cannot start span on ended trace "${this.name}"`
      );
    }

    // Auto-set parent to current active span if not specified
    const parentSpanId = options.parentSpanId ?? this._activeSpan?.id;

    const span = new Span(this.id, {
      ...options,
      parentSpanId,
    });

    this._spans.set(span.id, span);
    this._activeSpan = span;

    return span;
  }

  /**
   * Get a span by ID
   */
  getSpan(spanId: string): Span | undefined {
    return this._spans.get(spanId);
  }

  /**
   * Set the active span manually (for nested contexts)
   */
  setActiveSpan(span: Span | null): void {
    this._activeSpan = span;
  }

  /**
   * End this trace and send data to the server
   */
  end(): void {
    if (this._ended) {
      console.warn(`[Ducsigr] Trace "${this.name}" already ended`);
      return;
    }

    // End any spans that weren't ended
    for (const span of this._spans.values()) {
      if (!span.isEnded) {
        console.warn(
          `[Ducsigr] Auto-ending span "${span.name}" on trace end`
        );
        span.end();
      }
    }

    this._ended = true;

    // Trigger flush callback
    if (this._onEnd) {
      this._onEnd(this.toData());
    }
  }

  /**
   * Export trace data for transport
   */
  toData(): TraceData {
    return {
      id: this.id,
      name: this.name,
      sessionId: this.sessionId,
      userId: this.userId,
      user: this.user,
      timestamp: this.timestamp,
      metadata: this.metadata,
      spans: Array.from(this._spans.values()).map((s) => s.toData()),
    };
  }
}
