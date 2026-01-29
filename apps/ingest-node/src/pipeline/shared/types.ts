/**
 * Shared Pipeline Types
 *
 * Base interfaces shared across all ingestion pipelines.
 */
import type { Request, Response } from "express";

/**
 * Base pipeline context shared by all pipelines
 */
export interface BasePipelineContext {
  // Express request/response
  req: Request;
  res: Response;

  // Raw request data
  rawBody: Buffer;
  contentType: string;
  contentEncoding: string;

  // After auth
  projectId?: string;
  apiKeyId?: string;

  // Error tracking
  error?: PipelineError;
}

/**
 * Pipeline error with structured information
 */
export interface PipelineError {
  code: string;
  message: string;
  httpStatus: number;
  details?: Record<string, unknown>;
}

/**
 * Result of handler execution
 */
export interface HandlerResult {
  /** Whether to continue to the next handler */
  continue: boolean;
  /** Error if handler failed */
  error?: PipelineError;
}

/**
 * Generic handler interface for Chain of Responsibility
 */
export interface PipelineHandler<T extends BasePipelineContext> {
  /** Handler name for logging */
  readonly name: string;

  /** Process the context and optionally pass to next handler */
  handle(ctx: T): Promise<HandlerResult>;
}
