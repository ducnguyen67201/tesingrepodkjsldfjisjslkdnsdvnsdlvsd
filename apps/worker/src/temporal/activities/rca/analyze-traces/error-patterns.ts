/**
 * Error Pattern Extraction
 *
 * Functions for extracting and grouping error patterns from spans.
 */

import type { Prisma } from "@ducsigr/db";
import { z } from "zod";
import type { ErrorPattern } from "../../../types";
import type { SpanRow } from "../types";

/** Schema for extracting stack trace from span output */
const StackTraceOutputSchema = z.object({
  stack: z.string().optional(),
  stackTrace: z.string().optional(),
  error: z
    .object({
      stack: z.string().optional(),
    })
    .optional(),
});

/**
 * Normalize error message for grouping.
 * Replaces UUIDs, timestamps, IPs, line numbers with placeholders.
 */
export function normalizeErrorMessage(msg: string): string {
  return msg
    .replace(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
      "<UUID>"
    )
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/g, "<TIMESTAMP>")
    .replace(/line \d+/gi, "line <N>")
    .replace(/:\d+:\d+/g, ":<LINE>:<COL>")
    .replace(/\d+\.\d+\.\d+\.\d+/g, "<IP>")
    .slice(0, 200);
}

/**
 * Extract stack trace from span output if available.
 * Uses Zod validation for runtime safety.
 */
export function extractStackTrace(output: Prisma.JsonValue): string | undefined {
  const parsed = StackTraceOutputSchema.safeParse(output);
  if (!parsed.success) {
    return undefined;
  }

  const { stack, stackTrace, error } = parsed.data;
  const result = stack ?? stackTrace ?? error?.stack;
  return result?.slice(0, 500);
}

/**
 * Extract and group error patterns from spans.
 */
export function extractErrorPatterns(spans: SpanRow[]): ErrorPattern[] {
  const errorMap = new Map<
    string,
    {
      original: string;
      count: number;
      sampleSpanIds: string[];
      stackTrace?: string;
    }
  >();

  const errorSpans = spans.filter((s) => s.statusCode === "ERROR" && s.statusMessage);

  for (const span of errorSpans) {
    const normalized = normalizeErrorMessage(span.statusMessage!);
    const existing = errorMap.get(normalized);

    if (existing) {
      existing.count++;
      if (existing.sampleSpanIds.length < 3) {
        existing.sampleSpanIds.push(span.id);
      }
    } else {
      errorMap.set(normalized, {
        original: span.statusMessage!,
        count: 1,
        sampleSpanIds: [span.id],
        stackTrace: extractStackTrace(span.output),
      });
    }
  }

  const totalErrors = errorSpans.length || 1;

  return Array.from(errorMap.entries())
    .map(([, data]) => ({
      message: data.original.slice(0, 200),
      count: data.count,
      percentage: (data.count / totalErrors) * 100,
      sampleSpanIds: data.sampleSpanIds,
      stackTrace: data.stackTrace,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}
