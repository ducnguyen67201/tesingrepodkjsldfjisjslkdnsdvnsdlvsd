/**
 * RCA Internal Types
 *
 * Internal types used by RCA activities. Not exported to workflows.
 */

import type { Prisma } from "@ducsigr/db";

/**
 * Row returned from span query with trace info
 * Note: OTLP-first schema - traceName replaced with serviceName
 */
export interface SpanRow {
  id: string;
  traceId: string;
  serviceName: string | null;
  name: string;
  statusCode: string | null;
  statusMessage: string | null;
  model: string | null;
  startTime: Date;
  endTime: Date | null;
  promptTokens: number | null;
  completionTokens: number | null;
  totalCost: Prisma.Decimal | null;
  output: Prisma.JsonValue;
}
