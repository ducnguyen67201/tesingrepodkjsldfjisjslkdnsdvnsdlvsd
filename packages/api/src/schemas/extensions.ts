/**
 * Extensions Hub Schemas
 *
 * Zod schemas for extensions system - source of truth for types.
 */

import { z } from "zod";

// ============================================================================
// ENUMS (Mirror Prisma, derive constants)
// ============================================================================

/**
 * Extension types - categories of extensions
 */
export const ExtensionTypeSchema = z.enum([
  "THEME",
  "INGESTION",
  "POLICY",
  "WEBHOOK",
]);
export type ExtensionType = z.infer<typeof ExtensionTypeSchema>;
export const EXTENSION_TYPES = ExtensionTypeSchema.options;

/**
 * Extension type labels for UI display
 */
export const EXTENSION_TYPE_LABELS: Record<ExtensionType, string> = {
  THEME: "Theme",
  INGESTION: "Ingestion Handler",
  POLICY: "Policy Pack",
  WEBHOOK: "Webhook",
};

/**
 * Extension visibility - access control for catalog
 */
export const ExtensionVisibilitySchema = z.enum([
  "PUBLIC",
  "PRIVATE",
  "UNLISTED",
]);
export type ExtensionVisibility = z.infer<typeof ExtensionVisibilitySchema>;
export const EXTENSION_VISIBILITIES = ExtensionVisibilitySchema.options;

// ============================================================================
// PERMISSIONS (Capability-based)
// ============================================================================

/**
 * Extension permissions - fine-grained capabilities
 */
export const ExtensionPermissionSchema = z.enum([
  // Ingestion permissions
  "ingest:read-span",
  "ingest:write-span",

  // UI permissions
  "ui:theme",

  // Network permissions
  "network:none",
  "network:restricted",

  // Policy permissions
  "policy:read",
  "policy:write",
]);
export type ExtensionPermission = z.infer<typeof ExtensionPermissionSchema>;
export const EXTENSION_PERMISSIONS = ExtensionPermissionSchema.options;

/**
 * Human-readable permission labels
 */
export const PERMISSION_LABELS: Record<ExtensionPermission, string> = {
  "ingest:read-span": "Read trace spans",
  "ingest:write-span": "Modify trace spans",
  "ui:theme": "Customize workspace theme",
  "network:none": "No network access",
  "network:restricted": "Limited network access",
  "policy:read": "Read policies",
  "policy:write": "Modify policies",
};

/**
 * Permission risk levels for UI display
 */
export const PERMISSION_RISK: Record<
  ExtensionPermission,
  "low" | "medium" | "high"
> = {
  "ingest:read-span": "low",
  "ingest:write-span": "medium",
  "ui:theme": "low",
  "network:none": "low",
  "network:restricted": "high",
  "policy:read": "low",
  "policy:write": "high",
};

// ============================================================================
// MANIFEST SCHEMA (Validated on import/publish)
// ============================================================================

/**
 * Extension manifest - full extension metadata
 */
export const ExtensionManifestSchema = z.object({
  id: z
    .string()
    .regex(
      /^[a-z0-9-]+(\.[a-z0-9-]+)*$/,
      "Invalid extension ID format (use lowercase, dots, hyphens)"
    ),
  name: z.string().min(1, "Name is required").max(100),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, "Must be valid semver (x.y.z)"),
  description: z.string().max(500).optional(),
  type: ExtensionTypeSchema,
  entry: z.string().optional(),
  hooks: z.array(z.string()).optional(),
  configSchema: z.record(z.string(), z.unknown()).optional(),
  permissions: z.array(ExtensionPermissionSchema),
  author: z.string().optional(),
  homepage: z.string().url().optional(),
  icon: z.string().optional(),
});
export type ExtensionManifest = z.infer<typeof ExtensionManifestSchema>;

// ============================================================================
// TYPE-SPECIFIC CONFIG SCHEMAS
// ============================================================================

/**
 * Theme extension config
 */
export const ThemeConfigSchema = z.object({
  version: z.string().default("1.0"),
  fonts: z
    .object({
      body: z.string().optional(),
      heading: z.string().optional(),
    })
    .optional(),
  cssVars: z.record(z.string(), z.string()).optional(),
});
export type ThemeConfig = z.infer<typeof ThemeConfigSchema>;

/**
 * Ingestion handler config
 */
export const IngestionConfigSchema = z.object({
  hooks: z.array(
    z.enum(["after_parse", "after_normalize", "after_validate", "after_scrub"])
  ),
  priority: z.number().int().min(0).max(100).default(50),
});
export type IngestionConfig = z.infer<typeof IngestionConfigSchema>;

/**
 * Webhook extension config
 */
export const WebhookExtensionConfigSchema = z.object({
  url: z.string().url(),
  events: z.array(z.string()),
  secret: z.string().optional(),
  headers: z.record(z.string(), z.string()).optional(),
});
export type WebhookExtensionConfig = z.infer<typeof WebhookExtensionConfigSchema>;

// ============================================================================
// API INPUT SCHEMAS
// ============================================================================

/**
 * List extensions input
 */
export const ListExtensionsInput = z.object({
  workspaceSlug: z.string().optional(),
  type: ExtensionTypeSchema.optional(),
  search: z.string().optional(),
  visibility: ExtensionVisibilitySchema.optional(),
  installedOnly: z.boolean().optional(),
});
export type ListExtensionsInputType = z.infer<typeof ListExtensionsInput>;

/**
 * Get extension by ID input
 */
export const GetExtensionInput = z.object({
  extensionId: z.string().min(1),
  workspaceId: z.string().optional(),
});
export type GetExtensionInputType = z.infer<typeof GetExtensionInput>;

/**
 * Install extension input
 */
export const InstallExtensionInput = z.object({
  workspaceId: z.string().min(1),
  extensionId: z.string().min(1),
  versionId: z.string().optional(),
  approvedPermissions: z.array(ExtensionPermissionSchema),
  config: z.record(z.string(), z.unknown()).optional(),
});
export type InstallExtensionInputType = z.infer<typeof InstallExtensionInput>;

/**
 * Toggle extension (enable/disable) input
 */
export const ToggleExtensionInput = z.object({
  workspaceId: z.string().min(1),
  installId: z.string().min(1),
  enabled: z.boolean(),
});
export type ToggleExtensionInputType = z.infer<typeof ToggleExtensionInput>;

/**
 * Configure extension input
 */
export const ConfigureExtensionInput = z.object({
  workspaceId: z.string().min(1),
  installId: z.string().min(1),
  config: z.record(z.string(), z.unknown()),
});
export type ConfigureExtensionInputType = z.infer<typeof ConfigureExtensionInput>;

/**
 * Update extension version input
 */
export const UpdateExtensionInput = z.object({
  workspaceId: z.string().min(1),
  installId: z.string().min(1),
  versionId: z.string().min(1),
  approvedPermissions: z.array(ExtensionPermissionSchema).optional(),
});
export type UpdateExtensionInputType = z.infer<typeof UpdateExtensionInput>;

/**
 * Uninstall extension input
 */
export const UninstallExtensionInput = z.object({
  workspaceId: z.string().min(1),
  installId: z.string().min(1),
});
export type UninstallExtensionInputType = z.infer<typeof UninstallExtensionInput>;

/**
 * Import manifest input
 */
export const ImportManifestInput = z.object({
  workspaceId: z.string().min(1),
  manifest: ExtensionManifestSchema,
  visibility: ExtensionVisibilitySchema.default("PRIVATE"),
});
export type ImportManifestInputType = z.infer<typeof ImportManifestInput>;

// ============================================================================
// AUDIT ACTIONS
// ============================================================================

/**
 * Extension audit actions
 */
export const ExtensionAuditActionSchema = z.enum([
  "INSTALLED",
  "ENABLED",
  "DISABLED",
  "CONFIGURED",
  "UPDATED",
  "UNINSTALLED",
]);
export type ExtensionAuditAction = z.infer<typeof ExtensionAuditActionSchema>;
