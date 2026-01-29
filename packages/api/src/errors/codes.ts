import { z } from "zod";

/**
 * Application error codes - defined as Zod schema (source of truth).
 * These codes are used across the entire application for consistent error handling.
 */
export const AppErrorCodeSchema = z.enum([
  // Authentication & Authorization
  "UNAUTHORIZED",
  "FORBIDDEN",
  "SESSION_EXPIRED",

  // Resource errors
  "NOT_FOUND",
  "ALREADY_EXISTS",
  "CONFLICT",

  // User-related
  "USER_NOT_FOUND",
  "USER_NOT_SIGNED_UP",
  "USER_ALREADY_MEMBER",

  // Workspace-related
  "WORKSPACE_NOT_FOUND",
  "NO_WORKSPACE_ACCESS",

  // Domain-related
  "DOMAIN_ALREADY_EXISTS",
  "INVALID_DOMAIN",

  // Validation
  "VALIDATION_ERROR",
  "INVALID_INPUT",

  // Generic
  "INTERNAL_ERROR",
  "UNKNOWN_ERROR",
]);

export type AppErrorCode = z.infer<typeof AppErrorCodeSchema>;

/**
 * Human-readable error messages for each error code.
 * Frontend can use these directly for display.
 */
export const ERROR_MESSAGES: Record<AppErrorCode, string> = {
  // Authentication & Authorization
  UNAUTHORIZED: "You must be logged in to perform this action.",
  FORBIDDEN: "You don't have permission to perform this action.",
  SESSION_EXPIRED: "Your session has expired. Please log in again.",

  // Resource errors
  NOT_FOUND: "The requested resource was not found.",
  ALREADY_EXISTS: "This resource already exists.",
  CONFLICT: "This operation conflicts with the current state.",

  // User-related
  USER_NOT_FOUND: "User not found.",
  USER_NOT_SIGNED_UP: "This user must sign up first before they can be added.",
  USER_ALREADY_MEMBER: "This user is already a member of the workspace.",

  // Workspace-related
  WORKSPACE_NOT_FOUND: "Workspace not found.",
  NO_WORKSPACE_ACCESS: "You don't have access to any workspace.",

  // Domain-related
  DOMAIN_ALREADY_EXISTS: "This domain is already configured.",
  INVALID_DOMAIN: "Invalid domain format.",

  // Validation
  VALIDATION_ERROR: "The provided data is invalid.",
  INVALID_INPUT: "Invalid input provided.",

  // Generic
  INTERNAL_ERROR: "An internal error occurred. Please try again later.",
  UNKNOWN_ERROR: "An unexpected error occurred.",
};

/**
 * Map tRPC error codes to app error codes for common cases.
 */
export const TRPC_TO_APP_CODE: Record<string, AppErrorCode> = {
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  BAD_REQUEST: "VALIDATION_ERROR",
  INTERNAL_SERVER_ERROR: "INTERNAL_ERROR",
};
