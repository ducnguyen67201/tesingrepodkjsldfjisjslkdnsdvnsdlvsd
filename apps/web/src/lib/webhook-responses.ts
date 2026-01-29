import { NextResponse } from "next/server";

/**
 * Centralized webhook response messages.
 * All webhook endpoints should use these for consistent responses.
 */

// Cache control headers - webhooks should never be cached
const CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
} as const;

// ============================================
// Response Types
// ============================================

type WebhookResponseOptions = {
  status: number;
  headers?: Record<string, string>;
};

const createResponse = (
  body: Record<string, unknown>,
  options: WebhookResponseOptions
) => {
  return NextResponse.json(body, {
    status: options.status,
    headers: { ...CACHE_HEADERS, ...options.headers },
  });
};

// ============================================
// Success Responses (2xx)
// ============================================

export const webhookSuccess = {
  /** Webhook processed successfully */
  received: (workflowId?: string) =>
    createResponse(
      workflowId
        ? { message: "Webhook received", workflowId }
        : { message: "Webhook received" },
      { status: 200 }
    ),

  /** Ping event acknowledged */
  pong: () => createResponse({ message: "pong" }, { status: 200 }),

  /** Event intentionally skipped (not an error) */
  skipped: (reason: string) =>
    createResponse({ message: reason }, { status: 200 }),
} as const;

// ============================================
// Client Error Responses (4xx)
// ============================================

export const webhookError = {
  /** Missing required headers */
  missingHeaders: () =>
    createResponse({ error: "Missing required headers" }, { status: 400 }),

  /** Invalid JSON payload */
  invalidJson: () =>
    createResponse({ error: "Invalid JSON payload" }, { status: 400 }),

  /** Invalid payload structure (Zod validation failed) */
  invalidPayload: () =>
    createResponse({ error: "Invalid payload structure" }, { status: 400 }),

  /** Invalid repository name format */
  invalidRepoFormat: () =>
    createResponse({ error: "Invalid repository name format" }, { status: 400 }),

  /** Invalid webhook signature */
  invalidSignature: () =>
    createResponse({ error: "Invalid signature" }, { status: 401 }),
} as const;

// ============================================
// Server Error Responses (5xx)
// ============================================

export const webhookServerError = {
  /** Webhook not configured (missing secret) */
  notConfigured: () =>
    createResponse({ error: "Webhook not configured" }, { status: 500 }),

  /** Failed to process webhook */
  processingFailed: () =>
    createResponse({ error: "Failed to process webhook" }, { status: 500 }),
} as const;

// ============================================
// Skip Reasons (for logging clarity)
// ============================================

export const SKIP_REASONS = {
  EVENT_NOT_SUPPORTED: "Event not supported",
  NON_DEFAULT_BRANCH: "Non-default branch push ignored",
  PR_ACTION_NOT_RELEVANT: "PR action not relevant",
  REPO_NOT_REGISTERED: "Repository not registered",
} as const;

// ============================================
// Helper Functions
// ============================================

/**
 * Parse GitHub repository full_name into owner and repo.
 * Returns null if format is invalid.
 */
export const parseRepositoryFullName = (
  fullName: string
): { owner: string; repo: string } | null => {
  const parts = fullName.split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return null;
  }
  return { owner: parts[0], repo: parts[1] };
};
