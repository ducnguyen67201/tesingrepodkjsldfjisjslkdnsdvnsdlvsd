#!/usr/bin/env tsx
/**
 * Dev Seed: Create a fully set-up dev user in one command.
 *
 * Usage:
 *   pnpm db:seed-dev <email> <password>
 *   pnpm db:seed-dev duc@gmail.com mypassword123
 *
 * Creates:
 *   1. User (approved, system admin)
 *   2. Personal workspace
 *   3. Demo project
 *   4. Project membership (OWNER)
 *   5. API key (printed to console)
 */

import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { createHash, randomBytes } from "crypto";
import bcryptjs from "bcryptjs";

const { hash } = bcryptjs;

// Load .env from monorepo root BEFORE any other imports
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, "../../../.env") });

const { prisma } = await import("../src/index.js");

// ── Inline API key utils (avoid @ducsigr/shared dep) ───────
const API_KEY_PREFIX = "co_sk_";
const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

function generateApiKey(): string {
  const bytes = randomBytes(32);
  let result = API_KEY_PREFIX;
  for (const byte of bytes) {
    result += BASE62[byte % 62];
  }
  return result;
}

function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

// ── Parse args ──────────────────────────────────────────────
const [email, password] = process.argv.slice(2);

if (!email || !password) {
  console.error("\nUsage: pnpm db:seed-dev <email> <password>\n");
  console.error("Example: pnpm db:seed-dev duc@gmail.com mypassword123\n");
  process.exit(1);
}

if (password.length < 8) {
  console.error("\nPassword must be at least 8 characters.\n");
  process.exit(1);
}

// ── Seed ────────────────────────────────────────────────────
async function main() {
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  Ducsigr Dev Seed");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  // 1. Upsert user
  const hashedPassword = await hash(password, 12);
  const user = await prisma.user.upsert({
    where: { email },
    update: {
      password: hashedPassword,
      isApproved: true,
      isSystemAdmin: true,
    },
    create: {
      name: email.split("@")[0] ?? "Dev User",
      email,
      password: hashedPassword,
      isApproved: true,
      isSystemAdmin: true,
    },
  });
  console.log(`  User:      ${user.email} (${user.id})`);

  // 2. Upsert personal workspace
  const slug = email.split("@")[0]!.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  let workspace = await prisma.workspace.findFirst({
    where: { members: { some: { userId: user.id, role: "OWNER" } } },
  });

  if (!workspace) {
    workspace = await prisma.workspace.create({
      data: {
        name: `${user.name}'s Workspace`,
        slug: `${slug}-ws`,
        isPersonal: true,
        members: {
          create: { userId: user.id, role: "OWNER" },
        },
      },
    });
  }
  console.log(`  Workspace: ${workspace.name} (${workspace.slug})`);

  // 3. Upsert demo project
  let project = await prisma.project.findFirst({
    where: { workspaceId: workspace.id },
    orderBy: { createdAt: "asc" },
  });

  if (!project) {
    project = await prisma.project.create({
      data: {
        name: "Demo Project",
        workspaceId: workspace.id,
        members: {
          create: { userId: user.id, role: "OWNER" },
        },
      },
    });
  }
  console.log(`  Project:   ${project.name} (${project.id})`);

  // 4. Generate API key
  const rawKey = generateApiKey();
  const hashedKey = hashApiKey(rawKey);
  const lastFour = rawKey.slice(-4);

  // Delete old seed keys, create new one
  await prisma.apiKey.deleteMany({
    where: { projectId: project.id, name: "dev-seed" },
  });

  await prisma.apiKey.create({
    data: {
      projectId: project.id,
      hashedKey,
      displayKey: `co_sk_...${lastFour}`,
      name: "dev-seed",
    },
  });

  console.log(`  API Key:   ${rawKey}`);

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  Done! Sign in at http://localhost:3000");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
}

try {
  await main();
} catch (error) {
  console.error("\nSeed failed:", error);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
