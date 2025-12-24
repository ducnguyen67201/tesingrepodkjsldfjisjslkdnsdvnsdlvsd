#!/usr/bin/env tsx
/**
 * Database Seeding Orchestrator
 *
 * Usage:
 *   pnpm db:seed              # Run all seeds
 *   pnpm db:seed extensions   # Run specific seed
 *   pnpm db:seed --list       # List available seeds
 *
 * Available seeds:
 *   - users: Demo user and workspace
 *   - model-pricing: LLM model pricing data
 *   - extensions: Built-in extensions (themes, ingestion handlers)
 *   - knowledge: Knowledge base groups and articles
 */

import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

// Load .env from monorepo root BEFORE any other imports
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, "../../../.env") });

// Dynamic imports to ensure env is loaded first
const { prisma } = await import("../src/index.js");
const { seedUsers } = await import("./users.js");
const { seedModelPricing } = await import("./model-pricing.js");
const { seedExtensions } = await import("./extensions.js");
const { seedKnowledge } = await import("./knowledge.js");

// Registry of available seeds (order matters - users first)
const SEEDS: Record<string, { name: string; description: string; fn: () => Promise<void> }> = {
  users: {
    name: "users",
    description: "Demo user, workspace, and project",
    fn: seedUsers,
  },
  "model-pricing": {
    name: "model-pricing",
    description: "LLM model pricing (OpenAI, Anthropic, Google, Mistral)",
    fn: seedModelPricing,
  },
  extensions: {
    name: "extensions",
    description: "Built-in extensions (themes, ingestion handlers)",
    fn: seedExtensions,
  },
  knowledge: {
    name: "knowledge",
    description: "Knowledge base groups and articles",
    fn: seedKnowledge,
  },
};

function printUsage() {
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  CognObserve Database Seeding Tool");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  console.log("Usage:");
  console.log("  pnpm db:seed              Run all seeds");
  console.log("  pnpm db:seed <name>       Run specific seed");
  console.log("  pnpm db:seed --list       List available seeds");
  console.log("  pnpm db:seed --help       Show this help\n");
}

function listSeeds() {
  console.log("\nAvailable seeds:\n");
  for (const [key, seed] of Object.entries(SEEDS)) {
    console.log(`  ${key.padEnd(15)} ${seed.description}`);
  }
  console.log("");
}

async function runSeed(name: string) {
  const seed = SEEDS[name];
  if (!seed) {
    console.error(`\n❌ Unknown seed: ${name}`);
    console.log(`Run 'pnpm db:seed --list' to see available seeds.\n`);
    process.exit(1);
  }

  console.log(`\n━━━ Running seed: ${seed.name} ━━━\n`);
  await seed.fn();
}

async function runAllSeeds() {
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  Running All Seeds");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  for (const [_key, seed] of Object.entries(SEEDS)) {
    console.log(`\n━━━ ${seed.name} ━━━\n`);
    await seed.fn();
  }

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  ✅ All seeds completed!");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    printUsage();
    process.exit(0);
  }

  if (args.includes("--list") || args.includes("-l")) {
    listSeeds();
    process.exit(0);
  }

  try {
    if (args.length === 0) {
      await runAllSeeds();
    } else {
      for (const seedName of args) {
        await runSeed(seedName);
      }
    }
  } catch (error) {
    console.error("\n❌ Seeding failed:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
