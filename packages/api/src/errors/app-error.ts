import { TRPCError } from "@trpc/server";
import { AppErrorCode, ERROR_MESSAGES } from "./codes";

/**
 * Map AppErrorCode to tRPC error code.
 */
const APP_TO_TRPC_CODE: Record<AppErrorCode, TRPCError["code"]> = {
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  SESSION_EXPIRED: "UNAUTHORIZED",
  NOT_FOUND: "NOT_FOUND",
  ALREADY_EXISTS: "CONFLICT",
  CONFLICT: "CONFLICT",
  USER_NOT_FOUND: "NOT_FOUND",
  USER_NOT_SIGNED_UP: "NOT_FOUND",
  USER_ALREADY_MEMBER: "CONFLICT",
  WORKSPACE_NOT_FOUND: "NOT_FOUND",
  NO_WORKSPACE_ACCESS: "FORBIDDEN",
  DOMAIN_ALREADY_EXISTS: "CONFLICT",
  INVALID_DOMAIN: "BAD_REQUEST",
  VALIDATION_ERROR: "BAD_REQUEST",
  INVALID_INPUT: "BAD_REQUEST",
  INTERNAL_ERROR: "INTERNAL_SERVER_ERROR",
  UNKNOWN_ERROR: "INTERNAL_SERVER_ERROR",
};

/**
 * Application error response shape sent to the client.
 */
export interface AppErrorData {
  appCode: AppErrorCode;
  message: string;
}

/**
 * Create a tRPC error with standardized app error data.
 * This ensures all errors sent to the client have a consistent shape.
 *
 * @example
 * ```ts
 * throw createAppError("USER_NOT_SIGNED_UP");
 * throw createAppError("USER_NOT_FOUND", "Could not find user with email: test@example.com");
 * ```
 */
export function createAppError(
  appCode: AppErrorCode,
  customMessage?: string
): TRPCError {
  const message = customMessage ?? ERROR_MESSAGES[appCode];
  const trpcCode = APP_TO_TRPC_CODE[appCode];

  return new TRPCError({
    code: trpcCode,
    message,
    cause: { appCode, message } satisfies AppErrorData,
  });
}

/**
 * Type guard to check if an error cause contains AppErrorData.
 */
export function isAppErrorData(cause: unknown): cause is AppErrorData {
  return (
    typeof cause === "object" &&
    cause !== null &&
    "appCode" in cause &&
    "message" in cause
  );
}
