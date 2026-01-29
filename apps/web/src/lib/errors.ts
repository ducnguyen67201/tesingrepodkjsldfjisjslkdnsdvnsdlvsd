import { toast } from "sonner";

// ============================================================
// Error Codes & Types
// ============================================================

/**
 * Application error codes.
 * Keep in sync with packages/api/src/errors/codes.ts
 */
export type AppErrorCode =
  // Auth errors
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "SESSION_EXPIRED"
  // Generic errors
  | "NOT_FOUND"
  | "ALREADY_EXISTS"
  | "CONFLICT"
  | "VALIDATION_ERROR"
  | "INVALID_INPUT"
  | "INTERNAL_ERROR"
  | "UNKNOWN_ERROR"
  // User errors
  | "USER_NOT_FOUND"
  | "USER_NOT_SIGNED_UP"
  | "USER_ALREADY_MEMBER"
  // Workspace errors
  | "WORKSPACE_NOT_FOUND"
  | "NO_WORKSPACE_ACCESS"
  // Domain errors
  | "DOMAIN_ALREADY_EXISTS"
  | "INVALID_DOMAIN"
  // Project errors
  | "PROJECT_NOT_FOUND"
  // API Key errors
  | "API_KEY_NOT_FOUND"
  | "API_KEY_EXPIRED";

/**
 * Error data shape from API.
 */
export interface AppErrorData {
  appCode: AppErrorCode;
  message: string;
}

/**
 * Error display info extracted from an error object.
 */
export interface ErrorDisplay {
  /** Short title for the error (e.g., "User not found") */
  title: string;
  /** Longer description/message */
  message: string;
  /** App error code if available */
  code?: AppErrorCode;
}

// ============================================================
// Error Messages & Titles (Source of Truth)
// ============================================================

/**
 * Human-readable titles for each error code.
 */
const ERROR_TITLES: Record<AppErrorCode, string> = {
  // Auth
  UNAUTHORIZED: "Unauthorized",
  FORBIDDEN: "Access Denied",
  SESSION_EXPIRED: "Session Expired",
  // Generic
  NOT_FOUND: "Not Found",
  ALREADY_EXISTS: "Already Exists",
  CONFLICT: "Conflict",
  VALIDATION_ERROR: "Validation Error",
  INVALID_INPUT: "Invalid Input",
  INTERNAL_ERROR: "Error",
  UNKNOWN_ERROR: "Error",
  // User
  USER_NOT_FOUND: "User Not Found",
  USER_NOT_SIGNED_UP: "User Not Found",
  USER_ALREADY_MEMBER: "Already a Member",
  // Workspace
  WORKSPACE_NOT_FOUND: "Workspace Not Found",
  NO_WORKSPACE_ACCESS: "No Access",
  // Domain
  DOMAIN_ALREADY_EXISTS: "Domain Already Configured",
  INVALID_DOMAIN: "Invalid Domain",
  // Project
  PROJECT_NOT_FOUND: "Project Not Found",
  // API Key
  API_KEY_NOT_FOUND: "API Key Not Found",
  API_KEY_EXPIRED: "API Key Expired",
};

/**
 * Human-readable error messages for each error code.
 */
const ERROR_MESSAGES: Record<AppErrorCode, string> = {
  // Auth
  UNAUTHORIZED: "You must be logged in to perform this action.",
  FORBIDDEN: "You don't have permission to perform this action.",
  SESSION_EXPIRED: "Your session has expired. Please log in again.",
  // Generic
  NOT_FOUND: "The requested resource was not found.",
  ALREADY_EXISTS: "This resource already exists.",
  CONFLICT: "This operation conflicts with the current state.",
  VALIDATION_ERROR: "The provided data is invalid.",
  INVALID_INPUT: "Invalid input provided.",
  INTERNAL_ERROR: "An internal error occurred. Please try again later.",
  UNKNOWN_ERROR: "An unexpected error occurred.",
  // User
  USER_NOT_FOUND: "User not found.",
  USER_NOT_SIGNED_UP: "This user must sign up first before they can be added.",
  USER_ALREADY_MEMBER: "This user is already a member of the workspace.",
  // Workspace
  WORKSPACE_NOT_FOUND: "Workspace not found.",
  NO_WORKSPACE_ACCESS: "You don't have access to any workspace.",
  // Domain
  DOMAIN_ALREADY_EXISTS: "This domain is already configured for another workspace.",
  INVALID_DOMAIN: "Invalid domain format. Use format: example.com",
  // Project
  PROJECT_NOT_FOUND: "Project not found.",
  // API Key
  API_KEY_NOT_FOUND: "API key not found.",
  API_KEY_EXPIRED: "This API key has expired.",
};

// ============================================================
// Error Extraction Utilities
// ============================================================

/**
 * Type guard to check if an error cause contains AppErrorData.
 */
function isAppErrorData(cause: unknown): cause is AppErrorData {
  return (
    typeof cause === "object" &&
    cause !== null &&
    "appCode" in cause &&
    "message" in cause
  );
}

/**
 * Extract error information from any error object.
 * Works with tRPC errors, AppErrors, and standard Error objects.
 *
 * @example
 * ```tsx
 * try {
 *   await mutation.mutateAsync(data);
 * } catch (error) {
 *   const { title, message } = extractErrorInfo(error);
 *   // Use for custom handling
 * }
 * ```
 */
export function extractErrorInfo(error: unknown): ErrorDisplay {
  const defaultError: ErrorDisplay = {
    title: "Error",
    message: "An unexpected error occurred. Please try again.",
  };

  if (!error) return defaultError;

  if (typeof error === "object") {
    // Check if it's a tRPC error with our custom cause
    if ("cause" in error && isAppErrorData(error.cause)) {
      const appError = error.cause as AppErrorData;
      return {
        title: ERROR_TITLES[appError.appCode] ?? "Error",
        message: appError.message,
        code: appError.appCode,
      };
    }

    // Check for standard message property
    if ("message" in error && typeof error.message === "string") {
      const message = error.message;
      const title = inferTitleFromMessage(message);
      return { title, message };
    }
  }

  if (typeof error === "string") {
    return { title: "Error", message: error };
  }

  return defaultError;
}

/**
 * Infer a title from an error message for better UX.
 */
function inferTitleFromMessage(message: string): string {
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes("not found") || lowerMessage.includes("sign up first")) {
    return "Not Found";
  }
  if (lowerMessage.includes("already") && lowerMessage.includes("member")) {
    return "Already a Member";
  }
  if (lowerMessage.includes("already") && lowerMessage.includes("domain")) {
    return "Domain Already Configured";
  }
  if (lowerMessage.includes("already")) {
    return "Already Exists";
  }
  if (lowerMessage.includes("unauthorized") || lowerMessage.includes("log in")) {
    return "Unauthorized";
  }
  if (lowerMessage.includes("permission") || lowerMessage.includes("forbidden")) {
    return "Access Denied";
  }
  if (lowerMessage.includes("invalid")) {
    return "Invalid Input";
  }

  return "Error";
}

/**
 * Get the default error message for an app error code.
 */
export function getErrorMessage(code: AppErrorCode): string {
  return ERROR_MESSAGES[code];
}

/**
 * Get the title for an app error code.
 */
export function getErrorTitle(code: AppErrorCode): string {
  return ERROR_TITLES[code] ?? "Error";
}

// ============================================================
// Generic Error Toasts
// ============================================================

/**
 * Show an error toast for any error.
 * Automatically extracts the title and message from the error.
 *
 * @example
 * ```tsx
 * try {
 *   await mutation.mutateAsync(data);
 * } catch (error) {
 *   showError(error);
 * }
 * ```
 */
export function showError(error: unknown): ErrorDisplay {
  const errorInfo = extractErrorInfo(error);
  toast.error(errorInfo.title, { description: errorInfo.message });
  return errorInfo;
}

/**
 * Show an error toast with a custom message.
 *
 * @example
 * ```tsx
 * showErrorMessage("Failed to save", "Please check your connection and try again.");
 * ```
 */
export function showErrorMessage(title: string, message?: string): void {
  toast.error(title, { description: message });
}

// ============================================================
// Member Error Toasts
// ============================================================

export const memberError = {
  notFound: (email?: string) =>
    toast.error("User Not Found", {
      description: email
        ? `${email} must sign up first before they can be added.`
        : "This user must sign up first before they can be added.",
    }),

  alreadyMember: (email?: string) =>
    toast.error("Already a Member", {
      description: email
        ? `${email} is already a member of this workspace.`
        : "This user is already a member of this workspace.",
    }),

  cannotRemoveSelf: () =>
    toast.error("Cannot Remove Yourself", {
      description: "You cannot remove yourself from the workspace.",
    }),

  cannotRemoveOwner: () =>
    toast.error("Cannot Remove Owner", {
      description: "The workspace owner cannot be removed.",
    }),
} as const;

// ============================================================
// Domain Error Toasts
// ============================================================

export const domainError = {
  alreadyExists: (domain: string) =>
    toast.error("Domain Already Configured", {
      description: `@${domain} is already configured for another workspace.`,
    }),

  invalidFormat: () =>
    toast.error("Invalid Domain", {
      description: "Please enter a valid domain (e.g., example.com).",
    }),
} as const;

// ============================================================
// Workspace Error Toasts
// ============================================================

export const workspaceError = {
  notFound: () =>
    toast.error("Workspace Not Found", {
      description: "This workspace doesn't exist or you don't have access.",
    }),

  noAccess: () =>
    toast.error("No Access", {
      description: "You don't have access to this workspace.",
    }),

  slugTaken: (slug: string) =>
    toast.error("Slug Taken", {
      description: `The slug "${slug}" is already in use. Please choose another.`,
    }),
} as const;

// ============================================================
// Project Error Toasts
// ============================================================

export const projectError = {
  notFound: () =>
    toast.error("Project Not Found", {
      description: "This project doesn't exist or you don't have access.",
    }),

  noAccess: () =>
    toast.error("No Access", {
      description: "You don't have access to this project.",
    }),
} as const;

// ============================================================
// API Key Error Toasts
// ============================================================

export const apiKeyError = {
  notFound: () =>
    toast.error("API Key Not Found", {
      description: "This API key doesn't exist or has been revoked.",
    }),

  expired: () =>
    toast.error("API Key Expired", {
      description: "This API key has expired. Please create a new one.",
    }),
} as const;

// ============================================================
// Auth Error Toasts
// ============================================================

export const authError = {
  unauthorized: () =>
    toast.error("Unauthorized", {
      description: "You must be logged in to perform this action.",
    }),

  sessionExpired: () =>
    toast.error("Session Expired", {
      description: "Your session has expired. Please log in again.",
    }),

  invalidCredentials: () =>
    toast.error("Invalid Credentials", {
      description: "The email or password you entered is incorrect.",
    }),
} as const;

// ============================================================
// Form Error Toasts
// ============================================================

export const formError = {
  validation: (message?: string) =>
    toast.error("Validation Error", {
      description: message ?? "Please check your input and try again.",
    }),

  required: (fieldName: string) =>
    toast.error("Required Field", {
      description: `${fieldName} is required.`,
    }),
} as const;

// ============================================================
// Alert Error Toasts
// ============================================================

// ============================================================
// GitHub Error Toasts
// ============================================================

export const githubError = {
  cancelled: () =>
    toast.error("GitHub Connection Cancelled", {
      description: "You cancelled the GitHub authorization.",
    }),

  invalid_state: () =>
    toast.error("Session Expired", {
      description: "Your session has expired. Please try connecting again.",
    }),

  github_api_error: () =>
    toast.error("GitHub Connection Failed", {
      description: "Failed to connect to GitHub. Please try again.",
    }),

  missing_installation: () =>
    toast.error("Installation Failed", {
      description: "GitHub did not return installation details. Please try again.",
    }),

  not_configured: () =>
    toast.error("GitHub Not Configured", {
      description: "GitHub integration is not configured on this server.",
    }),

  disconnect_failed: () =>
    toast.error("Disconnect Failed", {
      description: "Failed to disconnect GitHub. Please try again.",
    }),
} as const;

// ============================================================
// Alert Error Toasts
// ============================================================

export const alertError = {
  notFound: () =>
    toast.error("Alert Not Found", {
      description: "This alert doesn't exist or has been deleted.",
    }),

  testFailed: (reason?: string) =>
    toast.error("Test Failed", {
      description: reason ?? "Failed to send test notification. Please check your channel configuration.",
    }),

  channelFailed: (provider: string) =>
    toast.error("Channel Error", {
      description: `Failed to add ${provider} channel. Please check your configuration.`,
    }),

  rcaFailed: (reason?: string) =>
    toast.error("RCA Analysis Failed", {
      description: reason ?? "Unable to complete root cause analysis. Please try again.",
    }),

  rcaTimeout: () =>
    toast.error("Analysis Timed Out", {
      description: "The analysis is taking longer than expected. Please try again later.",
    }),
} as const;

// ============================================================
// Knowledge Base Error Toasts
// ============================================================

export const knowledgeError = {
  articleNotFound: () =>
    toast.error("Article Not Found", {
      description: "This article doesn't exist or has been deleted.",
    }),

  groupNotFound: () =>
    toast.error("Group Not Found", {
      description: "This group doesn't exist or has been deleted.",
    }),

  slugExists: (slug: string) =>
    toast.error("Slug Already Exists", {
      description: `An article with slug "${slug}" already exists in this workspace.`,
    }),

  publishFailed: (reason?: string) =>
    toast.error("Publish Failed", {
      description: reason ?? "Failed to publish article. Please try again.",
    }),

  indexingFailed: () =>
    toast.error("Indexing Failed", {
      description: "Failed to index article for search. It may not appear in search results.",
    }),

  attachmentTooLarge: (maxSize: string) =>
    toast.error("File Too Large", {
      description: `Attachment exceeds the maximum size of ${maxSize}.`,
    }),

  attachmentUploadFailed: () =>
    toast.error("Upload Failed", {
      description: "Failed to upload attachment. Please try again.",
    }),
} as const;
