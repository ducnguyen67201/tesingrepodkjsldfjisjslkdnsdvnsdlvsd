/**
 * HTTP API client for MCP server.
 * Wraps fetch() with auth headers and Zod response validation.
 */
import { z } from "zod";
import {
  ListTracesResponseSchema,
  GetTraceResponseSchema,
  GetErrorTracesResponseSchema,
  SearchSpansResponseSchema,
  CostSummaryResponseSchema,
  TraceStatsResponseSchema,
  ProjectResponseSchema,
  ListAlertsResponseSchema,
  GetRCAResponseSchema,
  ApiErrorResponseSchema,
  type ListTracesResponse,
  type GetTraceResponse,
  type GetErrorTracesResponse,
  type SearchSpansResponse,
  type CostSummaryResponse,
  type TraceStatsResponse,
  type ProjectResponse,
  type ListAlertsResponse,
  type GetRCAResponse,
} from "./schemas.js";

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

export interface ApiClient {
  listTraces(input: Record<string, unknown>): Promise<ListTracesResponse>;
  getTrace(input: Record<string, unknown>): Promise<GetTraceResponse>;
  getErrorTraces(input: Record<string, unknown>): Promise<GetErrorTracesResponse>;
  searchSpans(input: Record<string, unknown>): Promise<SearchSpansResponse>;
  getCostSummary(input: Record<string, unknown>): Promise<CostSummaryResponse>;
  getTraceStats(input: Record<string, unknown>): Promise<TraceStatsResponse>;
  getProjectInfo(): Promise<ProjectResponse>;
  listAlerts(input: Record<string, unknown>): Promise<ListAlertsResponse>;
  getRCA(input: Record<string, unknown>): Promise<GetRCAResponse>;
}

async function request<T>(
  baseUrl: string,
  apiKey: string,
  path: string,
  schema: z.ZodType<T>,
  body?: Record<string, unknown>
): Promise<T> {
  const url = `${baseUrl}${path}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body ?? {}),
  });

  const json: unknown = await res.json();

  if (!res.ok) {
    const errorParsed = ApiErrorResponseSchema.safeParse(json);
    const message = errorParsed.success
      ? errorParsed.data.error
      : `HTTP ${res.status}`;
    const code = errorParsed.success ? errorParsed.data.code : undefined;
    throw new ApiClientError(message, res.status, code);
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new ApiClientError(
      `Invalid API response: ${parsed.error.message}`,
      500
    );
  }

  return parsed.data;
}

export function createApiClient(baseUrl: string, apiKey: string): ApiClient {
  // Normalize: strip trailing slash
  const base = baseUrl.replace(/\/+$/, "");

  return {
    listTraces: (input) =>
      request(base, apiKey, "/api/v1/mcp/traces", ListTracesResponseSchema, input),

    getTrace: (input) =>
      request(base, apiKey, "/api/v1/mcp/traces/detail", GetTraceResponseSchema, input),

    getErrorTraces: (input) =>
      request(base, apiKey, "/api/v1/mcp/traces/errors", GetErrorTracesResponseSchema, input),

    searchSpans: (input) =>
      request(base, apiKey, "/api/v1/mcp/spans/search", SearchSpansResponseSchema, input),

    getCostSummary: (input) =>
      request(base, apiKey, "/api/v1/mcp/analytics/costs", CostSummaryResponseSchema, input),

    getTraceStats: (input) =>
      request(base, apiKey, "/api/v1/mcp/analytics/stats", TraceStatsResponseSchema, input),

    getProjectInfo: () =>
      request(base, apiKey, "/api/v1/mcp/project", ProjectResponseSchema),

    listAlerts: (input) =>
      request(base, apiKey, "/api/v1/mcp/alerts", ListAlertsResponseSchema, input),

    getRCA: (input) =>
      request(base, apiKey, "/api/v1/mcp/alerts/rca", GetRCAResponseSchema, input),
  };
}
