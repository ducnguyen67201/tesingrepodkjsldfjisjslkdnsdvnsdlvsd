import { TRPCError } from "@trpc/server";

export const QUERY_TIMEOUTS = {
  LIST: 5_000, // 5 seconds - trace list
  DETAIL: 10_000, // 10 seconds - trace with all spans
  SPAN: 3_000, // 3 seconds - single span detail
} as const;

export type QueryTimeoutKey = keyof typeof QUERY_TIMEOUTS;

export class QueryTimeoutError extends TRPCError {
  constructor(context: string, timeoutMs: number) {
    super({
      code: "TIMEOUT",
      message: `Query timed out: ${context} (${timeoutMs}ms)`,
    });
  }
}

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  context: string
): Promise<T> {
  let timeoutId: NodeJS.Timeout;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new QueryTimeoutError(context, timeoutMs));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId!);
    return result;
  } catch (error) {
    clearTimeout(timeoutId!);
    throw error;
  }
}

export function withQueryTimeout<T>(
  promise: Promise<T>,
  type: QueryTimeoutKey,
  context?: string
): Promise<T> {
  return withTimeout(promise, QUERY_TIMEOUTS[type], context ?? type.toLowerCase());
}
