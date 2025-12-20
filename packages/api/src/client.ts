/**
 * Client-safe exports from @cognobserve/api
 *
 * This module exports only Zod schemas and types that are safe
 * to import in client-side code ("use client" components).
 *
 * Usage:
 * ```ts
 * import { CreateWorkspaceSchema, type CreateWorkspaceInput } from "@cognobserve/api/client";
 * ```
 */

// ============================================================
// Zod Schemas (safe for client-side)
// ============================================================

export {
  // Project role schemas
  ProjectRoleSchema,
  type ProjectRole,
  isValidRole,
  // Workspace schemas
  WorkspaceRoleSchema,
  type WorkspaceRole,
  CreateWorkspaceSchema,
  type CreateWorkspaceInput,
  UpdateWorkspaceSchema,
  type UpdateWorkspaceInput,
  InviteMemberSchema,
  type InviteMemberInput,
  WorkspaceSlugSchema,
  WORKSPACE_ADMIN_ROLES,
  WORKSPACE_MEMBER_ROLES,
  ALL_WORKSPACE_ROLES,
  isValidWorkspaceRole,
  // Trace filter schemas (OTLP-first)
  SpanTypeSchema,
  type SpanType,
  ALL_SPAN_TYPES,
  TraceFiltersSchema,
  type TraceFilters,
  FILTER_PARAM_KEYS,
  type QuickToggle,
  QUICK_TOGGLES,
  hasActiveFilters,
  countActiveFilters,
} from "./schemas";

// ============================================================
// Type-only exports (safe for client-side)
// ============================================================

export type { ApiKeyListItem, CreatedApiKey } from "./routers/apiKeys";
export type {
  WorkspaceListItem,
  WorkspaceDetail,
  WorkspaceMemberItem,
} from "./routers/workspaces";
export type { ProjectListItem, ProjectDetail } from "./routers/projects";
// NOTE: TraceListItem, TraceDetail, SpanItem, SpanDetail removed - will be reworked for OTLP-first design
// NOTE: ProjectAnalytics, WorkspaceAnalytics, etc. removed - will be reworked for OTLP-first design
export type { SessionWithStats } from "./schemas/sessions";
export type { TrackedUserWithStats, TrackedUserSummary } from "./schemas/trackedUsers";
