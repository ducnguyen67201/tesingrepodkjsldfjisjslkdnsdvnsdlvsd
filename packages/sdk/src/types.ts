/**
 * SDK Type Design Decision
 * ========================
 * The SDK maintains its own types separate from @ducsigr/proto for:
 *
 * 1. Developer Experience - Simpler types (e.g., 'DEBUG' vs 'SPAN_LEVEL_DEBUG')
 * 2. Zero Dependencies - No @bufbuild/protobuf required for SDK users
 * 3. SDK-Specific Types - Config, options, etc. that don't exist in proto
 *
 * The transport layer (transport.ts) handles mapping SDK types → proto wire format.
 * Proto remains the source of truth for the wire format between SDK and ingest service.
 */

/**
 * Span levels matching the proto definition
 * Maps to: SPAN_LEVEL_DEBUG, SPAN_LEVEL_DEFAULT, SPAN_LEVEL_WARNING, SPAN_LEVEL_ERROR
 */
export type SpanLevel = 'DEBUG' | 'DEFAULT' | 'WARNING' | 'ERROR';

/**
 * Token usage for LLM calls
 */
export interface TokenUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

/**
 * User info for tracking end-users of your AI application
 */
export interface UserInfo {
  /** Required: Your user's ID */
  id: string;
  /** Optional: Display name */
  name?: string;
  /** Optional: User email */
  email?: string;
  /** Optional: Additional metadata */
  [key: string]: unknown;
}

/**
 * Configuration options for Ducsigr.init()
 */
export interface DucsigrConfig {
  /** API key for authentication (or use DUCSIGR_API_KEY env var) */
  apiKey?: string;
  /** Ingest service endpoint */
  endpoint?: string;
  /** Enable debug logging */
  debug?: boolean;
  /** Disable SDK entirely (useful for development) */
  disabled?: boolean;
  /** Batch flush interval in ms (default: 5000) */
  flushInterval?: number;
  /** Max traces per batch (default: 10) */
  maxBatchSize?: number;
  /** Max retry attempts on failure (default: 3) */
  maxRetries?: number;
}

/**
 * Resolved config with all defaults applied
 */
export interface ResolvedConfig {
  apiKey: string;
  endpoint: string;
  debug: boolean;
  disabled: boolean;
  flushInterval: number;
  maxBatchSize: number;
  maxRetries: number;
}

/**
 * Options for starting a trace
 */
export interface TraceOptions {
  /** Name of the trace */
  name: string;
  /** Optional custom trace ID */
  id?: string;
  /** Optional session ID for grouping multi-turn conversations */
  sessionId?: string;
  /** Optional user ID for tracking end-users */
  userId?: string;
  /** Optional user info for tracking end-users */
  user?: UserInfo;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Options for starting a span
 */
export interface SpanOptions {
  /** Name of the span */
  name: string;
  /** Optional custom span ID */
  id?: string;
  /** Optional parent span ID (auto-detected if not provided) */
  parentSpanId?: string;
  /** Optional input data */
  input?: Record<string, unknown>;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Options for ending a span
 */
export interface SpanEndOptions {
  /** Output data to capture */
  output?: Record<string, unknown>;
  /** Span level (default: DEFAULT) */
  level?: SpanLevel;
  /** Status message (useful for errors) */
  statusMessage?: string;
}

/**
 * Internal span data for transport
 */
export interface SpanData {
  id: string;
  traceId: string;
  parentSpanId: string | null;
  name: string;
  startTime: Date;
  endTime: Date | null;
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  model: string | null;
  modelParameters: Record<string, unknown> | null;
  usage: TokenUsage | null;
  level: SpanLevel;
  statusMessage: string | null;
}

/**
 * Internal trace data for transport
 */
export interface TraceData {
  id: string;
  name: string;
  sessionId: string | null;
  userId: string | null;
  user: UserInfo | null;
  timestamp: Date;
  metadata: Record<string, unknown> | null;
  spans: SpanData[];
}

/**
 * Transport request matching ingest API
 */
export interface IngestRequest {
  trace_id?: string;
  session_id?: string;
  user_id?: string;
  user?: {
    name?: string;
    email?: string;
    [key: string]: unknown;
  };
  name: string;
  metadata?: Record<string, unknown>;
  spans: IngestSpan[];
}

/**
 * Span format for ingest API
 */
export interface IngestSpan {
  span_id?: string;
  parent_span_id?: string;
  name: string;
  start_time: string;
  end_time?: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  model?: string;
  model_parameters?: Record<string, unknown>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  level?: SpanLevel;
  status_message?: string;
}

/**
 * Response from ingest API
 */
export interface IngestResponse {
  trace_id: string;
  span_ids: string[];
  success: boolean;
}
