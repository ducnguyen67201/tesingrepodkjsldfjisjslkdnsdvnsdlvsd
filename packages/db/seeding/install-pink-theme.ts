#!/usr/bin/env tsx
/**
 * Install Pink Theme to Test Workspace
 *
 * Usage:
 *   pnpm --filter @ducsigr/db tsx seeding/install-pink-theme.ts
 *
 * This script:
 * 1. Seeds the Pink Sakura theme extension
 * 2. Installs it to the "test" workspace
 * 3. Enables it with pink CSS variables
 */

import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

// Load .env from monorepo root
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, "../../../.env") });

const { prisma, Prisma } = await import("../src/index.js");
const { seedExtensions } = await import("./extensions.js");

const PINK_THEME_SLUG = "ducsigr.theme.pink";
const TEST_WORKSPACE_SLUG = "test";

// Pink theme config with CSS variables
const PINK_THEME_CONFIG = {
  version: "1.0",
  cssVars: {
    primary: "330 81% 60%",
    "primary-foreground": "0 0% 100%",
    ring: "330 81% 60%",
    accent: "330 70% 95%",
    "accent-foreground": "330 81% 30%",
    "sidebar-primary": "330 81% 60%",
    "sidebar-primary-foreground": "0 0% 100%",
    "sidebar-accent": "330 70% 95%",
    "sidebar-accent-foreground": "330 81% 30%",
  },
};

async function main() {
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  Installing Pink Theme to Test Workspace");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  // Step 1: Seed extensions (ensures Pink theme exists)
  console.log("Step 1: Seeding extensions...\n");
  await seedExtensions();

  // Step 2: Find the test workspace
  console.log("\nStep 2: Finding test workspace...");
  const workspace = await prisma.workspace.findFirst({
    where: { slug: TEST_WORKSPACE_SLUG },
  });

  if (!workspace) {
    console.error(`\n❌ Workspace "${TEST_WORKSPACE_SLUG}" not found!`);
    console.log("Run `pnpm db:seed users` first to create the test workspace.\n");
    process.exit(1);
  }
  console.log(`  ✓ Found workspace: ${workspace.name} (${workspace.id})`);

  // Step 3: Find the Pink theme extension
  console.log("\nStep 3: Finding Pink theme extension...");
  const extension = await prisma.extension.findUnique({
    where: { slug: PINK_THEME_SLUG },
    include: {
      versions: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  if (!extension || extension.versions.length === 0) {
    console.error(`\n❌ Extension "${PINK_THEME_SLUG}" not found!`);
    process.exit(1);
  }
  const version = extension.versions[0]!;
  console.log(`  ✓ Found extension: ${extension.name} v${version.version}`);

  // Step 4: Check if already installed
  console.log("\nStep 4: Checking existing installation...");
  const existingInstall = await prisma.extensionInstall.findFirst({
    where: {
      workspaceId: workspace.id,
      extensionId: extension.id,
    },
  });

  let installId: string;

  if (existingInstall) {
    console.log("  ⚠ Already installed, updating config and enabling...");
    await prisma.extensionInstall.update({
      where: { id: existingInstall.id },
      data: {
        enabled: true,
        configJson: PINK_THEME_CONFIG as Prisma.InputJsonValue,
      },
    });
    installId = existingInstall.id;
  } else {
    // Step 5: Get a user to set as installedBy
    console.log("\nStep 5: Finding user for installation...");
    const member = await prisma.workspaceMember.findFirst({
      where: { workspaceId: workspace.id },
      include: { user: true },
    });

    if (!member) {
      console.error("\n❌ No workspace members found!");
      process.exit(1);
    }
    console.log(`  ✓ Using user: ${member.user.email}`);

    // Step 6: Install the theme
    console.log("\nStep 6: Installing Pink theme...");
    const install = await prisma.extensionInstall.create({
      data: {
        workspaceId: workspace.id,
        extensionId: extension.id,
        extensionVersionId: version.id,
        enabled: true,
        configJson: PINK_THEME_CONFIG as Prisma.InputJsonValue,
        approvedPermissions: ["ui:theme"],
        installedById: member.userId,
      },
    });
    installId = install.id;
  }

  // Step 7: Disable other theme extensions
  console.log("\nStep 7: Disabling other theme extensions...");
  const updated = await prisma.extensionInstall.updateMany({
    where: {
      workspaceId: workspace.id,
      extension: { type: "THEME" },
      id: { not: installId },
      enabled: true,
    },
    data: { enabled: false },
  });
  console.log(`  ✓ Disabled ${updated.count} other theme(s)`);

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  ✅ Pink Theme installed and activated!");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  console.log("Refresh your browser to see the pink theme applied.\n");
}

main()
  .catch((error) => {
    console.error("\n❌ Error:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
