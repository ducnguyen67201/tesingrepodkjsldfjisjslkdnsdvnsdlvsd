/**
 * Built-in Extensions
 *
 * Provides on-demand creation of built-in extensions.
 * Built-in extensions are created programmatically when first accessed,
 * not pre-seeded in the database.
 *
 * This approach:
 * - Avoids migration complexity for seed data
 * - Ensures built-ins exist when needed
 * - Uses idempotent upsert to avoid duplicates
 */

import { prisma, Prisma } from "@cognobserve/db";
import { type ExtensionType, type ExtensionPermission } from "../../schemas/extensions";

/** System user ID for built-in extensions owner */
const SYSTEM_USER_SLUG = "system";

/**
 * Built-in extension definition
 */
interface BuiltinExtension {
  slug: string;
  name: string;
  description: string;
  type: ExtensionType;
  permissions: ExtensionPermission[];
  version: string;
  configSchema?: Record<string, unknown>;
}

/**
 * List of built-in extensions
 */
const BUILTIN_EXTENSIONS: BuiltinExtension[] = [
  {
    slug: "cognobserve.theme.default",
    name: "Default Theme",
    description: "The default CognObserve theme with customizable colors and fonts.",
    type: "THEME",
    permissions: ["ui:theme"],
    version: "1.0.0",
    configSchema: {
      type: "object",
      properties: {
        version: { type: "string", default: "1.0" },
        fonts: {
          type: "object",
          properties: {
            body: { type: "string" },
            heading: { type: "string" },
          },
        },
        cssVars: {
          type: "object",
          additionalProperties: { type: "string" },
        },
      },
    },
  },
];

/**
 * Get or create system user for built-in extensions.
 *
 * Creates a special system user if it doesn't exist.
 * This user owns all built-in extensions.
 */
async function getOrCreateSystemUser(): Promise<string> {
  // First, try to find existing system user
  const existing = await prisma.user.findFirst({
    where: {
      email: "system@cognobserve.internal",
    },
    select: { id: true },
  });

  if (existing) {
    return existing.id;
  }

  // Create system user if not exists
  const systemUser = await prisma.user.create({
    data: {
      email: "system@cognobserve.internal",
      name: "CognObserve System",
      // System user has no auth - it's only for ownership records
    },
    select: { id: true },
  });

  console.log("Created system user for built-in extensions:", systemUser.id);
  return systemUser.id;
}

/**
 * Ensure a single built-in extension exists.
 *
 * Uses upsert pattern to idempotently create or update.
 */
async function ensureBuiltinExtension(
  builtin: BuiltinExtension,
  systemUserId: string
): Promise<void> {
  const manifest = {
    id: builtin.slug,
    name: builtin.name,
    version: builtin.version,
    type: builtin.type,
    description: builtin.description,
    permissions: builtin.permissions,
    configSchema: builtin.configSchema,
  };

  // Try to find existing extension
  const existing = await prisma.extension.findUnique({
    where: { slug: builtin.slug },
    select: { id: true },
  });

  if (existing) {
    // Extension exists, check if version exists
    const versionExists = await prisma.extensionVersion.findUnique({
      where: {
        extensionId_version: {
          extensionId: existing.id,
          version: builtin.version,
        },
      },
    });

    if (!versionExists) {
      // Add new version
      await prisma.extensionVersion.create({
        data: {
          extensionId: existing.id,
          version: builtin.version,
          manifest: manifest as Prisma.InputJsonValue,
        },
      });
      console.log(`Added version ${builtin.version} to built-in: ${builtin.slug}`);
    }
    return;
  }

  // Create new extension with initial version
  await prisma.extension.create({
    data: {
      slug: builtin.slug,
      name: builtin.name,
      description: builtin.description,
      type: builtin.type,
      visibility: "PUBLIC",
      ownerId: systemUserId,
      versions: {
        create: {
          version: builtin.version,
          manifest: manifest as Prisma.InputJsonValue,
        },
      },
    },
  });

  console.log(`Created built-in extension: ${builtin.slug}`);
}

/**
 * Ensure all built-in extensions exist in the database.
 *
 * Call this during application startup or before first extension access.
 * Uses idempotent upsert pattern - safe to call multiple times.
 */
export async function ensureBuiltinExtensions(): Promise<void> {
  console.log("Ensuring built-in extensions exist...");

  try {
    const systemUserId = await getOrCreateSystemUser();

    for (const builtin of BUILTIN_EXTENSIONS) {
      await ensureBuiltinExtension(builtin, systemUserId);
    }

    console.log(`Built-in extensions check complete: ${BUILTIN_EXTENSIONS.length} extensions`);
  } catch (error) {
    console.error("Failed to ensure built-in extensions:", error);
    // Don't throw - built-ins are optional enhancement
  }
}

/**
 * Get list of built-in extension slugs.
 * Useful for identifying built-in vs user-created extensions.
 */
export function getBuiltinExtensionSlugs(): string[] {
  return BUILTIN_EXTENSIONS.map((b) => b.slug);
}
