/**
 * Extension Seeding
 *
 * Seeds built-in extensions (themes, ingestion handlers, etc.)
 */

import { prisma, Prisma } from "../src/index.js";

const SYSTEM_USER_EMAIL = "system@cognobserve.internal";

interface ExtensionSeed {
  slug: string;
  name: string;
  description: string;
  type: "THEME" | "INGESTION" | "POLICY" | "WEBHOOK";
  visibility: "PUBLIC" | "PRIVATE" | "UNLISTED";
  version: string;
  manifest: Record<string, unknown>;
}

const EXTENSIONS: ExtensionSeed[] = [
  {
    slug: "cognobserve.theme.default",
    name: "Default Theme",
    description: "The default CognObserve theme with customizable colors and fonts.",
    type: "THEME",
    visibility: "PUBLIC",
    version: "1.0.0",
    manifest: {
      id: "cognobserve.theme.default",
      name: "Default Theme",
      version: "1.0.0",
      type: "THEME",
      description: "The default CognObserve theme.",
      permissions: ["ui:theme"],
      configSchema: {
        type: "object",
        properties: {
          primaryColor: { type: "string", default: "#facc15" },
          fonts: {
            type: "object",
            properties: {
              body: { type: "string", default: "Inter" },
              heading: { type: "string", default: "Inter" },
            },
          },
        },
      },
    },
  },
  {
    slug: "cognobserve.theme.dark-mode",
    name: "Dark Mode Enhanced",
    description: "Enhanced dark theme optimized for low-light environments with high contrast options.",
    type: "THEME",
    visibility: "PUBLIC",
    version: "1.0.0",
    manifest: {
      id: "cognobserve.theme.dark-mode",
      name: "Dark Mode Enhanced",
      version: "1.0.0",
      type: "THEME",
      description: "Enhanced dark theme with high contrast options.",
      permissions: ["ui:theme"],
      configSchema: {
        type: "object",
        properties: {
          contrast: { type: "string", enum: ["normal", "high"], default: "normal" },
          accentColor: { type: "string", default: "#3b82f6" },
        },
      },
    },
  },
  {
    slug: "cognobserve.ingestion.pii-scrubber",
    name: "PII Scrubber",
    description: "Automatically detects and redacts personally identifiable information from traces.",
    type: "INGESTION",
    visibility: "PUBLIC",
    version: "1.0.0",
    manifest: {
      id: "cognobserve.ingestion.pii-scrubber",
      name: "PII Scrubber",
      version: "1.0.0",
      type: "INGESTION",
      description: "Redacts PII from traces before storage.",
      permissions: ["ingest:read-span", "ingest:write-span"],
      hooks: ["after_parse", "after_normalize"],
      configSchema: {
        type: "object",
        properties: {
          patterns: {
            type: "array",
            items: { type: "string" },
            default: ["email", "phone", "ssn", "credit_card"],
          },
          replacement: { type: "string", default: "[REDACTED]" },
        },
      },
    },
  },
  {
    slug: "cognobserve.ingestion.cost-enricher",
    name: "Cost Enricher",
    description: "Automatically calculates and adds cost metadata to LLM spans based on model pricing.",
    type: "INGESTION",
    visibility: "PUBLIC",
    version: "1.0.0",
    manifest: {
      id: "cognobserve.ingestion.cost-enricher",
      name: "Cost Enricher",
      version: "1.0.0",
      type: "INGESTION",
      description: "Adds cost calculations to spans.",
      permissions: ["ingest:read-span", "ingest:write-span"],
      hooks: ["after_validate"],
      configSchema: {
        type: "object",
        properties: {
          customPricing: {
            type: "object",
            description: "Override pricing for specific models",
          },
        },
      },
    },
  },
  {
    slug: "cognobserve.ingestion.latency-tagger",
    name: "Latency Tagger",
    description: "Tags spans with latency categories (fast, normal, slow, critical) for easier filtering.",
    type: "INGESTION",
    visibility: "PUBLIC",
    version: "1.0.0",
    manifest: {
      id: "cognobserve.ingestion.latency-tagger",
      name: "Latency Tagger",
      version: "1.0.0",
      type: "INGESTION",
      description: "Categorizes spans by latency.",
      permissions: ["ingest:read-span", "ingest:write-span"],
      hooks: ["after_validate"],
      configSchema: {
        type: "object",
        properties: {
          thresholds: {
            type: "object",
            properties: {
              fast: { type: "number", default: 100 },
              normal: { type: "number", default: 500 },
              slow: { type: "number", default: 2000 },
            },
          },
        },
      },
    },
  },
];

async function getOrCreateSystemUser(): Promise<string> {
  const existing = await prisma.user.findFirst({
    where: { email: SYSTEM_USER_EMAIL },
    select: { id: true },
  });

  if (existing) {
    return existing.id;
  }

  const user = await prisma.user.create({
    data: {
      email: SYSTEM_USER_EMAIL,
      name: "CognObserve System",
    },
    select: { id: true },
  });

  console.log("  Created system user");
  return user.id;
}

export async function seedExtensions(): Promise<void> {
  console.log("Seeding extensions...\n");

  const systemUserId = await getOrCreateSystemUser();
  let created = 0;
  let skipped = 0;

  for (const ext of EXTENSIONS) {
    const existing = await prisma.extension.findUnique({
      where: { slug: ext.slug },
      include: { versions: true },
    });

    if (existing) {
      const hasVersion = existing.versions.some((v) => v.version === ext.version);
      if (hasVersion) {
        console.log(`  [skip] ${ext.slug} v${ext.version}`);
        skipped++;
        continue;
      }

      await prisma.extensionVersion.create({
        data: {
          extensionId: existing.id,
          version: ext.version,
          manifest: ext.manifest as Prisma.InputJsonValue,
        },
      });
      console.log(`  [update] ${ext.slug} added v${ext.version}`);
      created++;
      continue;
    }

    await prisma.extension.create({
      data: {
        slug: ext.slug,
        name: ext.name,
        description: ext.description,
        type: ext.type,
        visibility: ext.visibility,
        ownerId: systemUserId,
        versions: {
          create: {
            version: ext.version,
            manifest: ext.manifest as Prisma.InputJsonValue,
          },
        },
      },
    });
    console.log(`  [create] ${ext.slug} v${ext.version}`);
    created++;
  }

  console.log(`\n  Summary: ${created} created/updated, ${skipped} skipped`);
}
