/**
 * Unified Error Handling
 *
 * This module provides standardized error handling across the application.
 *
 * API Usage:
 * ```ts
 * import { createAppError } from "../errors";
 *
 * // Throw with default message
 * throw createAppError("USER_NOT_SIGNED_UP");
 *
 * // Throw with custom message
 * throw createAppError("NOT_FOUND", "Project not found");
 * ```
 *
 * Frontend Usage:
 * ```ts
 * import { extractErrorMessage } from "@/lib/errors";
 *
 * try {
 *   await mutation.mutateAsync(data);
 * } catch (error) {
 *   const { title, message } = extractErrorMessage(error);
 *   toast.error(title, { description: message });
 * }
 * ```
 */

export * from "./codes";
export * from "./app-error";
