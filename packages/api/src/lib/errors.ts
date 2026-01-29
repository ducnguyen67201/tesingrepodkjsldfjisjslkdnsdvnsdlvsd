import { TRPCError } from "@trpc/server";

export const ERROR_CODES = {
  // Trace-specific errors
  TRACE_NOT_FOUND: { code: "NOT_FOUND", message: "Trace not found" },
  SPAN_NOT_FOUND: { code: "NOT_FOUND", message: "Span not found" },
  INVALID_CURSOR: { code: "BAD_REQUEST", message: "Invalid pagination cursor" },
  QUERY_TIMEOUT: { code: "TIMEOUT", message: "Query timed out" },

  // General errors
  UNAUTHORIZED: { code: "UNAUTHORIZED", message: "Authentication required" },
  FORBIDDEN: { code: "FORBIDDEN", message: "Access denied" },
  VALIDATION_ERROR: { code: "BAD_REQUEST", message: "Validation failed" },
} as const;

export function createTraceError(
  key: keyof typeof ERROR_CODES,
  details?: Record<string, unknown>
): TRPCError {
  const { code, message } = ERROR_CODES[key];
  return new TRPCError({
    code: code as TRPCError["code"],
    message,
    cause: details,
  });
}

export function isTraceNotFound(error: unknown): boolean {
  return error instanceof TRPCError && error.code === "NOT_FOUND";
}
