import { generateId } from './utils/id';
import type {
  SpanOptions,
  SpanEndOptions,
  SpanData,
  SpanLevel,
  TokenUsage,
} from './types';

/**
 * Represents a single operation within a trace
 */
export class Span {
  readonly id: string;
  readonly traceId: string;
  readonly parentSpanId: string | null;
  readonly name: string;
  readonly startTime: Date;

  private _endTime: Date | null = null;
  private _input: Record<string, unknown> | null = null;
  private _output: Record<string, unknown> | null = null;
  private _metadata: Record<string, unknown> | null = null;
  private _model: string | null = null;
  private _modelParameters: Record<string, unknown> | null = null;
  private _usage: TokenUsage | null = null;
  private _level: SpanLevel = 'DEFAULT';
  private _statusMessage: string | null = null;
  private _ended = false;

  constructor(traceId: string, options: SpanOptions) {
    this.id = options.id ?? generateId();
    this.traceId = traceId;
    this.parentSpanId = options.parentSpanId ?? null;
    this.name = options.name;
    this.startTime = new Date();
    this._input = options.input ?? null;
    this._metadata = options.metadata ?? null;
  }

  /**
   * Whether this span has been ended
   */
  get isEnded(): boolean {
    return this._ended;
  }

  /**
   * Duration in milliseconds (null if not ended)
   */
  get duration(): number | null {
    if (!this._endTime) return null;
    return this._endTime.getTime() - this.startTime.getTime();
  }

  /**
   * Set input data for this span
   */
  setInput(input: Record<string, unknown>): this {
    this._input = input;
    return this;
  }

  /**
   * Set output data for this span
   */
  setOutput(output: Record<string, unknown>): this {
    this._output = output;
    return this;
  }

  /**
   * Set or merge metadata for this span
   */
  setMetadata(metadata: Record<string, unknown>): this {
    this._metadata = { ...this._metadata, ...metadata };
    return this;
  }

  /**
   * Set model information for LLM spans
   */
  setModel(model: string, parameters?: Record<string, unknown>): this {
    this._model = model;
    if (parameters) {
      this._modelParameters = parameters;
    }
    return this;
  }

  /**
   * Set token usage for LLM spans
   */
  setUsage(usage: TokenUsage): this {
    this._usage = usage;
    return this;
  }

  /**
   * Set the span level
   */
  setLevel(level: SpanLevel): this {
    this._level = level;
    return this;
  }

  /**
   * Mark this span as an error
   */
  setError(message: string): this {
    this._level = 'ERROR';
    this._statusMessage = message;
    return this;
  }

  /**
   * Set a warning on this span
   */
  setWarning(message: string): this {
    this._level = 'WARNING';
    this._statusMessage = message;
    return this;
  }

  /**
   * End this span
   */
  end(options?: SpanEndOptions): void {
    if (this._ended) {
      console.warn(`[Ducsigr] Span "${this.name}" already ended`);
      return;
    }

    this._endTime = new Date();
    this._ended = true;

    if (options?.output) {
      this._output = options.output;
    }
    if (options?.level) {
      this._level = options.level;
    }
    if (options?.statusMessage) {
      this._statusMessage = options.statusMessage;
    }
  }

  /**
   * Export span data for transport
   */
  toData(): SpanData {
    return {
      id: this.id,
      traceId: this.traceId,
      parentSpanId: this.parentSpanId,
      name: this.name,
      startTime: this.startTime,
      endTime: this._endTime,
      input: this._input,
      output: this._output,
      metadata: this._metadata,
      model: this._model,
      modelParameters: this._modelParameters,
      usage: this._usage,
      level: this._level,
      statusMessage: this._statusMessage,
    };
  }
}
