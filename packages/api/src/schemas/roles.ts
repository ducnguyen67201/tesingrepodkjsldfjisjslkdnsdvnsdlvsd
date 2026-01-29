import { z } from "zod";

/**
 * Project member roles - defined as Zod schema (source of truth).
 * Types are inferred from the schema.
 */
export const ProjectRoleSchema = z.enum(["OWNER", "ADMIN", "MEMBER", "VIEWER"]);

export type ProjectRole = z.infer<typeof ProjectRoleSchema>;

/**
 * Role combinations for authorization checks.
 * Derived from the schema to ensure type safety.
 */
export const ADMIN_ROLES: readonly ProjectRole[] = ["OWNER", "ADMIN"] as const;
export const MEMBER_ROLES: readonly ProjectRole[] = ["OWNER", "ADMIN", "MEMBER"] as const;
export const ALL_ROLES: readonly ProjectRole[] = ProjectRoleSchema.options;

/**
 * Validate a role string against the schema.
 */
export const isValidRole = (role: string): role is ProjectRole => {
  return ProjectRoleSchema.safeParse(role).success;
};
