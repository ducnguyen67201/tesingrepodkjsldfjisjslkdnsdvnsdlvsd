// Initialize shared config before any imports that use it
import "./init";

/**
 * @ducsigr/api
 *
 * Centralized tRPC API package for Ducsigr.
 *
 * Usage (Frontend):
 * ```ts
 * import { trpc } from "@/lib/trpc/client";
 *
 * // Query
 * const { data } = trpc.apiKeys.list.useQuery({ projectId: "..." });
 *
 * // Mutation
 * const mutation = trpc.apiKeys.create.useMutation();
 * await mutation.mutateAsync({ projectId: "...", name: "Production" });
 * ```
 *
 * Usage (Backend - creating new routes):
 * ```ts
 * import { createRouter, protectedProcedure } from "@ducsigr/api";
 *
 * export const myRouter = createRouter({
 *   myAction: protectedProcedure
 *     .input(z.object({ ... }))
 *     .mutation(async ({ ctx, input }) => { ... }),
 * });
 * ```
 */

// ============================================================
// Router Exports
// ============================================================

export { appRouter, type AppRouter } from "./routers";

// ============================================================
// Router Factory & Procedures
// ============================================================

export {
  createRouter,
  publicProcedure,
  protectedProcedure,
  projectAdminProcedure,
  projectAdminMiddleware,
  middleware,
  mergeRouters,
  createCallerFactory,
} from "./trpc";

// ============================================================
// Context & Types
// ============================================================

export type { Context, SessionWithProjects, ProjectAccess } from "./context";

// Re-export types from routers
export type { ApiKeyListItem, CreatedApiKey } from "./routers/apiKeys";
export type {
  WorkspaceListItem,
  WorkspaceDetail,
  WorkspaceMemberItem,
} from "./routers/workspaces";
export type { AllowedDomainItem } from "./routers/domains";
export type { SpanWithType, TraceListItem } from "./routers/traces";

// Re-export types from services
export type { TrackRCARequestOutput } from "./services/rca.service";
export type { TrackedUserBasic } from "./services/trackedUser.service";

// Re-export types from lib
export type { TraceWithSpans } from "./lib/filtering/query-builder";

// ============================================================
// Auth Middleware Utilities
// ============================================================

export {
  requireAuth,
  requireProjectAccess,
  requireProjectRole,
  hasProjectAccess,
  hasProjectRole,
  ADMIN_ROLES,
  MEMBER_ROLES,
  ALL_ROLES,
} from "./middleware/auth";

// ============================================================
// Zod Schemas (source of truth for types)
// ============================================================

export {
  ProjectRoleSchema,
  type ProjectRole,
  isValidRole,
  // Workspace schemas
  WorkspaceRoleSchema,
  type WorkspaceRole,
  CreateWorkspaceSchema,
  type CreateWorkspaceInput,
  WorkspaceSlugSchema,
  WORKSPACE_ADMIN_ROLES,
  WORKSPACE_MEMBER_ROLES,
  ALL_WORKSPACE_ROLES,
  isValidWorkspaceRole,
} from "./schemas";

// ============================================================
// Error Handling
// ============================================================

export {
  // Error codes
  AppErrorCodeSchema,
  type AppErrorCode,
  ERROR_MESSAGES,
  TRPC_TO_APP_CODE,
  // Error utilities
  createAppError,
  isAppErrorData,
  type AppErrorData,
} from "./errors";

// ============================================================
// Domain Matcher Utilities
// ============================================================

export {
  DomainSchema,
  extractDomainFromEmail,
  emailMatchesDomain,
  validateDomain,
  isValidDomainFormat,
} from "./lib/domain-matcher";
