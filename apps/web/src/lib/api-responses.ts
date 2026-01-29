import { NextResponse } from "next/server";

/**
 * Centralized API response utilities.
 * Use these for consistent responses across all API routes.
 *
 * @example
 * ```typescript
 * // Error responses
 * return apiError.unauthorized();
 * return apiError.invalidJson();
 * return apiError.notFound("Alert");
 *
 * // Success responses
 * return apiSuccess.ok({ data: result });
 * return apiSuccess.created(newUser);
 * ```
 */

// ============================================
// Constants
// ============================================

/** Standard cache control header - API responses should not be cached */
export const CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
} as const;

// ============================================
// Response Builders
// ============================================

type ResponseOptions = {
  status: number;
  headers?: Record<string, string>;
};

const json = (body: Record<string, unknown>, options: ResponseOptions) => {
  return NextResponse.json(body, {
    status: options.status,
    headers: { ...CACHE_HEADERS, ...options.headers },
  });
};

// ============================================
// Success Responses (2xx)
// ============================================

export const apiSuccess = {
  /** 200 OK - Generic success response */
  ok: (data: Record<string, unknown>) => json(data, { status: 200 }),

  /** 200 OK - With success flag (for internal APIs) */
  okWithFlag: (data: Record<string, unknown>) =>
    json({ success: true, ...data }, { status: 200 }),

  /** 201 Created - Resource created successfully */
  created: (data: Record<string, unknown>) => json(data, { status: 201 }),

  /** 204 No Content - Success with no body */
  noContent: () => new NextResponse(null, { status: 204, headers: CACHE_HEADERS }),
} as const;

// ============================================
// Client Error Responses (4xx)
// ============================================

export const apiError = {
  // --- 400 Bad Request ---

  /** Invalid JSON in request body */
  invalidJson: () => json({ error: "Invalid JSON" }, { status: 400 }),

  /** Validation failed (Zod or custom) */
  validation: (message?: string, details?: unknown) =>
    json(
      details
        ? { error: message ?? "Validation failed", code: "VALIDATION_ERROR", details }
        : { error: message ?? "Validation failed", code: "VALIDATION_ERROR" },
      { status: 400 }
    ),

  /** Generic bad request */
  badRequest: (message: string) => json({ error: message }, { status: 400 }),

  // --- 401 Unauthorized ---

  /** Missing or invalid authentication */
  unauthorized: (message?: string) =>
    json({ error: message ?? "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 }),

  /** Invalid API key */
  invalidApiKey: () =>
    json({ error: "Invalid or expired API key", code: "UNAUTHORIZED" }, { status: 401 }),

  /** Invalid signature (webhooks) */
  invalidSignature: () =>
    json({ error: "Invalid signature", code: "UNAUTHORIZED" }, { status: 401 }),

  // --- 403 Forbidden ---

  /** User lacks permission */
  forbidden: (message?: string) =>
    json({ error: message ?? "Forbidden", code: "FORBIDDEN" }, { status: 403 }),

  // --- 404 Not Found ---

  /** Resource not found */
  notFound: (resource?: string) =>
    json(
      { error: resource ? `${resource} not found` : "Not found", code: "NOT_FOUND" },
      { status: 404 }
    ),

  // --- 409 Conflict ---

  /** Resource already exists */
  conflict: (message: string) =>
    json({ error: message, code: "ALREADY_EXISTS" }, { status: 409 }),

  /** User already exists (registration) */
  userExists: () =>
    json({ error: "User already exists", code: "ALREADY_EXISTS" }, { status: 409 }),

  // --- 429 Too Many Requests ---

  /** Rate limit exceeded */
  rateLimited: (retryAfter?: number) =>
    json(
      { error: "Rate limit exceeded" },
      {
        status: 429,
        headers: retryAfter ? { "Retry-After": String(retryAfter) } : undefined,
      }
    ),
} as const;

// ============================================
// Server Error Responses (5xx)
// ============================================

export const apiServerError = {
  /** 500 Internal Server Error */
  internal: (message?: string) =>
    json({ error: message ?? "Internal server error", code: "INTERNAL_ERROR" }, { status: 500 }),

  /** 500 - Service not configured */
  notConfigured: (service: string) =>
    json({ error: `${service} not configured`, code: "INTERNAL_ERROR" }, { status: 500 }),

  /** 503 Service Unavailable */
  unavailable: (message?: string) =>
    json({ error: message ?? "Service temporarily unavailable" }, { status: 503 }),
} as const;

// ============================================
// Internal API Responses (with success flag)
// ============================================

/**
 * Internal API responses use { success: boolean, ... } format
 * for consistency with Go ingest service expectations.
 */
export const internalApiError = {
  unauthorized: () => json({ success: false, error: "Unauthorized" }, { status: 401 }),

  invalidJson: () => json({ success: false, error: "Invalid JSON" }, { status: 400 }),

  validation: (message?: string, details?: unknown) =>
    json(
      details
        ? { success: false, error: message ?? "Invalid request", details }
        : { success: false, error: message ?? "Invalid request" },
      { status: 400 }
    ),

  notFound: (resource?: string) =>
    json(
      { success: false, error: resource ? `${resource} not found` : "Not found" },
      { status: 404 }
    ),

  internal: () => json({ success: false, error: "Internal server error" }, { status: 500 }),
} as const;

export const internalApiSuccess = {
  /** Generic success with data */
  ok: (data: Record<string, unknown>) => json({ success: true, ...data }, { status: 200 }),

  /** Validation success (for validate-key endpoint) */
  valid: (data: Record<string, unknown>) => json({ valid: true, ...data }, { status: 200 }),

  /** Validation failure (not an error, just invalid) */
  invalid: (error: string) => json({ valid: false, error }, { status: 401 }),
} as const;

// ============================================
// Error Code Constants (for client reference)
// ============================================

export const ERROR_CODES = {
  // Auth
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  // Validation
  VALIDATION_ERROR: "VALIDATION_ERROR",
  INVALID_INPUT: "INVALID_INPUT",
  // Resource
  NOT_FOUND: "NOT_FOUND",
  ALREADY_EXISTS: "ALREADY_EXISTS",
  CONFLICT: "CONFLICT",
  // Server
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;
