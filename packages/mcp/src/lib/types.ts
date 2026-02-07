export interface TraceRow {
  id: string;
  serviceName: string;
  rootSpanName: string | null;
  durationMs: number | null;
  errorCount: number;
  spanCount: number;
  startTime: Date;
  hasError: boolean;
}

export interface TraceTableOptions {
  total: number;
  timeRange: string;
  nextCursor?: string;
}

export interface SpanNode {
  id: string;
  externalSpanId: string;
  parentSpanId: string | null;
  name: string;
  kind: string;
  spanType: string | null;
  statusCode: string;
  statusMessage: string | null;
  durationMs: number | null;
  startTime: Date;
  endTime: Date | null;
  model: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  totalCost: number | null;
  input?: unknown;
  output?: unknown;
  httpMethod: string | null;
  httpRoute: string | null;
  httpStatusCode: number | null;
  dbSystem: string | null;
  dbOperation: string | null;
  exceptionType: string | null;
  exceptionMessage: string | null;
  children: SpanNode[];
}

export interface FlatSpan {
  id: string;
  externalSpanId: string;
  parentSpanId: string | null;
  name: string;
  kind: string;
  spanType: string | null;
  statusCode: string;
  statusMessage: string | null;
  durationMs: number | null;
  startTime: Date;
  endTime: Date | null;
  model: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  totalCost: number | null;
  input?: unknown;
  output?: unknown;
  httpMethod: string | null;
  httpRoute: string | null;
  httpStatusCode: number | null;
  dbSystem: string | null;
  dbOperation: string | null;
  exceptionType: string | null;
  exceptionMessage: string | null;
}

export interface ErrorGroup {
  exceptionType: string;
  count: number;
  spans: Array<{
    id: string;
    name: string;
    exceptionMessage: string | null;
    statusMessage: string | null;
    startTime: Date;
    trace: {
      id: string;
      serviceName: string;
      rootSpanName: string | null;
    };
  }>;
}

export interface CostModelRow {
  model: string | null;
  spanCount: number;
  inputTokens: number;
  outputTokens: number;
  totalCost: number;
}

export interface CostDayRow {
  date: Date;
  spanCount: number;
  inputTokens: number;
  outputTokens: number;
  totalCost: number;
}

export interface CostServiceRow {
  model: string | null;
  spanCount: number;
  promptTokens: number;
  completionTokens: number;
  totalCost: number;
}

export interface TraceStatsData {
  totalCount: number;
  errorCount: number;
  percentiles: Record<string, number>;
  serviceStats: Array<{
    serviceName: string;
    _count: number;
    _avg: { durationMs: number | null };
  }>;
  errorRateByService: Array<{
    serviceName: string;
    _count: number;
  }>;
  timeRange: string;
}

export interface ProjectInfo {
  id: string;
  name: string;
  createdAt: Date;
  workspace: {
    id: string;
    name: string;
  };
  _count: {
    traces: number;
    apiKeys: number;
  };
}
