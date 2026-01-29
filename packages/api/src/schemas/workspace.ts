import { z } from "zod";

/**
 * Workspace member roles - defined as Zod schema (source of truth).
 * Types are inferred from the schema.
 */
export const WorkspaceRoleSchema = z.enum(["OWNER", "ADMIN", "MEMBER"]);

export type WorkspaceRole = z.infer<typeof WorkspaceRoleSchema>;

/**
 * Role combinations for authorization checks.
 * Derived from the schema to ensure type safety.
 */
export const WORKSPACE_ADMIN_ROLES: readonly WorkspaceRole[] = [
  "OWNER",
  "ADMIN",
] as const;
export const WORKSPACE_MEMBER_ROLES: readonly WorkspaceRole[] = [
  "OWNER",
  "ADMIN",
  "MEMBER",
] as const;
export const ALL_WORKSPACE_ROLES: readonly WorkspaceRole[] =
  WorkspaceRoleSchema.options;

/**
 * Validate a workspace role string against the schema.
 */
export const isValidWorkspaceRole = (role: string): role is WorkspaceRole => {
  return WorkspaceRoleSchema.safeParse(role).success;
};

/**
 * Workspace slug validation.
 * Must be lowercase alphanumeric with hyphens, 3-50 characters.
 */
export const WorkspaceSlugSchema = z
  .string()
  .min(3, "Slug must be at least 3 characters")
  .max(50, "Slug must be at most 50 characters")
  .regex(
    /^[a-z0-9][a-z0-9-]*[a-z0-9]$/,
    "Slug must be lowercase alphanumeric with hyphens, and cannot start or end with a hyphen"
  );

/**
 * Schema for creating a new workspace.
 */
export const CreateWorkspaceSchema = z.object({
  name: z.string().min(1, "Name is required").max(100).trim(),
  slug: WorkspaceSlugSchema,
});

export type CreateWorkspaceInput = z.infer<typeof CreateWorkspaceSchema>;

/**
 * Schema for updating a workspace.
 */
export const UpdateWorkspaceSchema = z.object({
  workspaceId: z.string().min(1),
  name: z.string().min(1).max(100).trim().optional(),
});

export type UpdateWorkspaceInput = z.infer<typeof UpdateWorkspaceSchema>;

/**
 * Schema for inviting a member to a workspace.
 */
export const InviteMemberSchema = z.object({
  workspaceId: z.string().min(1),
  email: z.string().email("Invalid email address"),
  role: WorkspaceRoleSchema.exclude(["OWNER"]),
});

export type InviteMemberInput = z.infer<typeof InviteMemberSchema>;
