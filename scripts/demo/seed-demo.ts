#!/usr/bin/env tsx
/**
 * Demo Seeding Script with Doppler Environment Support
 *
 * This script sets up a complete demo environment with all data needed
 * for customer demonstrations. It uses Doppler for environment variable
 * management, allowing seamless deployment to local/staging environments.
 *
 * Usage:
 *   # Basic usage - pass workspace name as argument
 *   doppler run -- pnpm tsx scripts/demo/seed-demo.ts "My Company"
 *
 *   # With specific doppler project
 *   doppler run --project ducsigr -- pnpm tsx scripts/demo/seed-demo.ts "Acme Corp"
 *
 *   # With specific doppler config (staging)
 *   doppler run --project ducsigr --config stg -- pnpm tsx scripts/demo/seed-demo.ts "Demo Inc"
 *
 *   # Additional options
 *   doppler run -- pnpm tsx scripts/demo/seed-demo.ts "My Company" --traces 500
 *   doppler run -- pnpm tsx scripts/demo/seed-demo.ts "My Company" --no-traces
 *   doppler run -- pnpm tsx scripts/demo/seed-demo.ts "My Company" --reset
 *
 * Arguments:
 *   <workspace-name>   Name of the workspace to create (required)
 *
 * Options:
 *   --traces <n>       Number of traces to generate (default: 1000)
 *   --no-traces        Skip trace generation
 *   --reset            Delete existing workspace and recreate
 *   --dry-run          Validate without making changes
 *   --help, -h         Show help
 *
 * Environment Variables (from Doppler):
 *   DATABASE_URL       PostgreSQL connection string (required)
 *   INGEST_URL         Ingest service URL (optional, defaults to http://localhost:8080)
 */

import crypto from "crypto";

// ============================================================
// Configuration from Environment (Doppler)
// ============================================================

const ENV = {
  DATABASE_URL: process.env.DATABASE_URL,
  INGEST_URL: process.env.INGEST_URL || "http://localhost:8080",
  DOPPLER_PROJECT: process.env.DOPPLER_PROJECT || "unknown",
  DOPPLER_CONFIG: process.env.DOPPLER_CONFIG || "unknown",
};

function validateEnvironment(): void {
  if (!ENV.DATABASE_URL) {
    console.error("\n❌ ERROR: DATABASE_URL is not set");
    console.error("   This script requires Doppler environment injection.\n");
    console.error("   Usage:");
    console.error("     doppler run -- pnpm tsx scripts/demo/seed-demo.ts \"Workspace Name\"");
    console.error("     doppler run --project ducsigr --config stg -- pnpm tsx scripts/demo/seed-demo.ts \"Workspace Name\"\n");
    process.exit(1);
  }
}

// ============================================================
// CLI Arguments
// ============================================================

interface CliOptions {
  workspaceName: string;
  workspaceSlug: string;
  traceCount: number;
  skipTraces: boolean;
  reset: boolean;
  dryRun: boolean;
  help: boolean;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);

  const options: CliOptions = {
    workspaceName: "",
    workspaceSlug: "",
    traceCount: 1000,
    skipTraces: false,
    reset: false,
    dryRun: false,
    help: false,
  };

  // Check for help first
  if (args.includes("--help") || args.includes("-h")) {
    options.help = true;
    return options;
  }

  // First non-flag argument is workspace name
  let workspaceNameFound = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;

    if (arg.startsWith("--")) {
      switch (arg) {
        case "--traces":
          if (args[i + 1]) {
            options.traceCount = parseInt(args[i + 1]!, 10);
            i++;
          }
          break;
        case "--no-traces":
          options.skipTraces = true;
          break;
        case "--reset":
          options.reset = true;
          break;
        case "--dry-run":
          options.dryRun = true;
          break;
      }
    } else if (!workspaceNameFound) {
      options.workspaceName = arg;
      options.workspaceSlug = slugify(arg);
      workspaceNameFound = true;
    }
  }

  return options;
}

function printHelp(): void {
  console.log(`
Demo Seeding Script with Doppler Support

Usage:
  doppler run -- pnpm tsx scripts/demo/seed-demo.ts <workspace-name> [options]
  doppler run --project <proj> --config <cfg> -- pnpm tsx scripts/demo/seed-demo.ts <workspace-name> [options]

Arguments:
  <workspace-name>     Name of the workspace to create (required, use quotes for spaces)

Options:
  --traces <n>         Number of traces to generate (default: 1000)
  --no-traces          Skip trace generation
  --reset              Delete existing workspace and recreate
  --dry-run            Validate without making changes
  --help, -h           Show this help

Environment Variables (from Doppler):
  DATABASE_URL         PostgreSQL connection string (required)
  INGEST_URL           Ingest service URL (default: http://localhost:8080)

Examples:
  # Create "Demo Company" workspace in local environment
  doppler run -- pnpm tsx scripts/demo/seed-demo.ts "Demo Company"

  # Create workspace in staging environment
  doppler run --project ducsigr --config stg -- pnpm tsx scripts/demo/seed-demo.ts "Acme Corp"

  # Create with custom trace count
  doppler run -- pnpm tsx scripts/demo/seed-demo.ts "My Startup" --traces 500

  # Reset existing workspace and reseed
  doppler run -- pnpm tsx scripts/demo/seed-demo.ts "Demo Company" --reset

  # Dry run to validate
  doppler run -- pnpm tsx scripts/demo/seed-demo.ts "Test Company" --dry-run

What gets created:
  - Workspace with the given name
  - "Support Copilot" project with API key
  - 3 prompts with versions, labels, and A/B experiment
  - Knowledge base with groups and articles
  - 1000 synthetic traces with logs (unless --no-traces)
`);
}

// ============================================================
// Helpers
// ============================================================

function generateApiKey(): string {
  const prefix = "dsg";
  const randomBytes = crypto.randomBytes(24).toString("base64url");
  return `${prefix}_${randomBytes}`;
}

function hashApiKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

function generateChecksum(content: unknown, config: unknown): string {
  const data = JSON.stringify({ content, config });
  return crypto.createHash("sha256").update(data).digest("hex").substring(0, 16);
}

function sha256(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

// ============================================================
// Default Configuration
// ============================================================

const DEFAULT_CONFIG = {
  project: {
    name: "Support Copilot",
  },
  apiKey: {
    name: "Demo API Key",
  },
  traces: {
    batchSize: 50,
    scenarios: {
      success: 0.7,
      slow: 0.15,
      error: 0.1,
      retry: 0.05,
    },
    models: ["gpt-4", "gpt-4-turbo", "gpt-3.5-turbo", "claude-3-opus", "claude-3-sonnet"],
    timeRangeHours: 168,
  },
};

// ============================================================
// Data Definitions
// ============================================================

const PROMPTS_DATA = [
  {
    name: "Support Reply",
    slug: "support-reply",
    description: "Generate helpful support replies for customer inquiries",
    tags: ["support", "customer-facing", "production"],
    versions: [
      {
        version: 1,
        type: "chat" as const,
        content: {
          type: "chat",
          messages: [
            { role: "system", content: "You are a helpful customer support agent. Be professional and concise." },
            { role: "user", content: "Customer inquiry: {{inquiry}}\n\nContext: {{context}}" },
          ],
        },
        variables: [
          { name: "inquiry", required: true, description: "The customer's question or issue" },
          { name: "context", required: false, description: "Additional context" },
        ],
        config: { model: "gpt-4", temperature: 0.7, maxTokens: 500 },
        labels: [] as string[],
      },
      {
        version: 2,
        type: "chat" as const,
        content: {
          type: "chat",
          messages: [
            { role: "system", content: "You are a helpful customer support agent.\n\nGuidelines:\n- Be professional and empathetic\n- Acknowledge concerns first\n- Provide clear next steps" },
            { role: "user", content: "Customer: {{customerName}}\nInquiry: {{inquiry}}\n\nContext: {{context}}" },
          ],
        },
        variables: [
          { name: "customerName", required: true, description: "Customer's name" },
          { name: "inquiry", required: true, description: "The customer's question" },
          { name: "context", required: false, default: "No previous orders", description: "Order history" },
        ],
        config: { model: "gpt-4", temperature: 0.6, maxTokens: 600 },
        labels: ["production"],
      },
      {
        version: 3,
        type: "chat" as const,
        content: {
          type: "chat",
          messages: [
            { role: "system", content: "You are an expert customer support agent.\n\nCore Principles:\n1. EMPATHY FIRST\n2. CLARITY\n3. PROACTIVE\n4. OWNERSHIP\n\nResponse Structure:\n- Greeting with name\n- Acknowledgment\n- Solution\n- Closing" },
            { role: "user", content: "Customer: {{customerName}}\nPriority: {{priority}}\nInquiry: {{inquiry}}\n\nContext: {{context}}" },
          ],
        },
        variables: [
          { name: "customerName", required: true, description: "Customer's name" },
          { name: "priority", required: false, default: "normal", description: "Priority level" },
          { name: "inquiry", required: true, description: "Customer's question" },
          { name: "context", required: false, default: "No context", description: "Context" },
        ],
        config: { model: "gpt-4-turbo", temperature: 0.5, maxTokens: 800 },
        labels: ["staging", "latest"],
      },
    ],
  },
  {
    name: "Ticket Classifier",
    slug: "ticket-classifier",
    description: "Classify support tickets into categories for routing",
    tags: ["classification", "internal", "production"],
    versions: [
      {
        version: 1,
        type: "chat" as const,
        content: {
          type: "chat",
          messages: [
            { role: "system", content: "Classify the ticket into: ORDER_STATUS, REFUND_RETURN, PRODUCT_QUESTION, TECHNICAL_ISSUE, BILLING, GENERAL. Respond with only the category name." },
            { role: "user", content: "{{ticketContent}}" },
          ],
        },
        variables: [{ name: "ticketContent", required: true, description: "The ticket text" }],
        config: { model: "gpt-3.5-turbo", temperature: 0, maxTokens: 20 },
        labels: ["production", "latest"],
      },
    ],
  },
  {
    name: "Sentiment Analyzer",
    slug: "sentiment-analyzer",
    description: "Analyze customer sentiment for prioritization",
    tags: ["analytics", "internal"],
    versions: [
      {
        version: 1,
        type: "text" as const,
        content: {
          type: "text",
          text: "Analyze sentiment: {{message}}\n\nRespond with JSON: {\"sentiment\": \"positive|negative|neutral\", \"score\": -1 to 1}",
        },
        variables: [{ name: "message", required: true, description: "Customer message" }],
        config: { model: "gpt-3.5-turbo", temperature: 0, maxTokens: 150 },
        labels: ["production", "latest"],
      },
    ],
  },
];

const EXPERIMENT_CONFIG = {
  name: "Support Reply A/B Test",
  slug: "support-reply-ab-test",
  description: "Testing improved prompt structure (v3) against current production (v2)",
  promptSlug: "support-reply",
  variantA: { version: 2, weight: 5000 },
  variantB: { version: 3, weight: 5000 },
};

const KNOWLEDGE_GROUPS = [
  {
    name: "Troubleshooting",
    description: "Common issues and solutions",
    children: [
      { name: "LLM Errors", description: "Handling LLM provider errors" },
      { name: "Performance", description: "Performance optimization guides" },
    ],
  },
  {
    name: "Runbooks",
    description: "Step-by-step operational procedures",
    children: [{ name: "Incident Response", description: "How to respond to incidents" }],
  },
  {
    name: "Best Practices",
    description: "Recommended patterns and practices",
    children: [
      { name: "Prompt Engineering", description: "Writing effective prompts" },
      { name: "Cost Optimization", description: "Reducing LLM costs" },
    ],
  },
];

const KNOWLEDGE_ARTICLES = [
  {
    title: "Handling OpenAI Rate Limits",
    slug: "handling-openai-rate-limits",
    summary: "How to handle and prevent OpenAI API rate limit errors",
    content: `# Handling OpenAI Rate Limits\n\n## Overview\nOpenAI rate limits can cause your application to fail if not handled properly.\n\n## Detection\n- HTTP 429 status code\n- Error: "rate_limit_exceeded"\n\n## Prevention\n1. Implement exponential backoff\n2. Use rate limiting middleware\n3. Queue requests`,
    tags: ["openai", "rate-limits", "errors"],
    groupPath: ["Troubleshooting", "LLM Errors"],
  },
  {
    title: "Optimizing LLM Latency",
    slug: "optimizing-llm-latency",
    summary: "Techniques to reduce LLM response latency",
    content: `# Optimizing LLM Latency\n\n## Techniques\n1. Enable streaming\n2. Cache common queries\n3. Use smaller models for simple tasks\n4. Right-size prompts`,
    tags: ["latency", "performance"],
    groupPath: ["Troubleshooting", "Performance"],
  },
  {
    title: "Incident Response Runbook",
    slug: "incident-response-runbook",
    summary: "Step-by-step guide for production incidents",
    content: `# Incident Response Runbook\n\n## Severity Levels\n- P1: Immediate (outage)\n- P2: 15 min (major issue)\n- P3: 1 hour (minor issue)\n\n## Steps\n1. Acknowledge\n2. Assess\n3. Mitigate\n4. Communicate\n5. Resolve`,
    tags: ["incident", "runbook"],
    groupPath: ["Runbooks", "Incident Response"],
  },
  {
    title: "Writing Effective Prompts",
    slug: "writing-effective-prompts",
    summary: "Best practices for prompt engineering",
    content: `# Writing Effective Prompts\n\n## Principles\n1. Be specific\n2. Provide context\n3. Use examples\n4. Set output format`,
    tags: ["prompts", "best-practices"],
    groupPath: ["Best Practices", "Prompt Engineering"],
  },
  {
    title: "Reducing LLM Costs",
    slug: "reducing-llm-costs",
    summary: "Strategies for cost optimization",
    content: `# Reducing LLM Costs\n\n## Strategies\n1. Right-size models\n2. Compress prompts\n3. Implement caching\n4. Set max_tokens\n5. Monitor usage`,
    tags: ["costs", "optimization"],
    groupPath: ["Best Practices", "Cost Optimization"],
  },
];

// ============================================================
// Seeding Functions
// ============================================================

async function cleanExistingData(prisma: any, workspaceSlug: string, dryRun: boolean): Promise<void> {
  console.log("\n━━━ Cleaning Existing Data ━━━\n");

  const workspace = await prisma.workspace.findUnique({
    where: { slug: workspaceSlug },
    include: { projects: true },
  });

  if (!workspace) {
    console.log("  No existing workspace found.\n");
    return;
  }

  console.log(`  Found workspace: ${workspace.name}`);

  for (const project of workspace.projects) {
    const counts = {
      traces: await prisma.trace.count({ where: { projectId: project.id } }),
      logs: await prisma.logRecord.count({ where: { projectId: project.id } }),
      experiments: await prisma.promptExperiment.count({ where: { projectId: project.id } }),
      prompts: await prisma.prompt.count({ where: { projectId: project.id } }),
    };

    console.log(`  Project: ${project.name}`);
    console.log(`    Traces: ${counts.traces}, Logs: ${counts.logs}`);
    console.log(`    Prompts: ${counts.prompts}, Experiments: ${counts.experiments}`);

    if (!dryRun) {
      if (counts.traces > 0) {
        await prisma.span.deleteMany({ where: { trace: { projectId: project.id } } });
        await prisma.trace.deleteMany({ where: { projectId: project.id } });
      }
      if (counts.logs > 0) {
        await prisma.logRecord.deleteMany({ where: { projectId: project.id } });
      }
      if (counts.experiments > 0) {
        await prisma.promptExperiment.deleteMany({ where: { projectId: project.id } });
      }
      if (counts.prompts > 0) {
        await prisma.prompt.deleteMany({ where: { projectId: project.id } });
      }
      await prisma.apiKey.deleteMany({ where: { projectId: project.id } });
      await prisma.project.delete({ where: { id: project.id } });
    }
  }

  // Delete KB
  const kbCount = await prisma.knowledgeArticle.count({ where: { workspaceId: workspace.id } });
  if (kbCount > 0 && !dryRun) {
    await prisma.knowledgeArticle.deleteMany({ where: { workspaceId: workspace.id } });
    await prisma.knowledgeGroup.deleteMany({ where: { workspaceId: workspace.id } });
    console.log(`  Deleted ${kbCount} KB articles`);
  }

  // Delete workspace members and workspace
  if (!dryRun) {
    await prisma.workspaceMember.deleteMany({ where: { workspaceId: workspace.id } });
    await prisma.workspace.delete({ where: { id: workspace.id } });
  }

  console.log(dryRun ? "\n  [DRY RUN - No changes made]\n" : "\n  ✓ Cleaned successfully\n");
}

async function seedWorkspaceAndProject(
  prisma: any,
  workspaceName: string,
  workspaceSlug: string,
  dryRun: boolean
): Promise<{ workspaceId: string; projectId: string; apiKey: string; userId: string }> {
  console.log("━━━ Step 1/4: Workspace & Project ━━━\n");

  if (dryRun) {
    console.log("  [DRY RUN] Would create:");
    console.log(`    - Workspace: ${workspaceName} (${workspaceSlug})`);
    console.log(`    - Project: ${DEFAULT_CONFIG.project.name}`);
    console.log(`    - API Key\n`);
    return { workspaceId: "dry-run", projectId: "dry-run", apiKey: "dsg_dry_run", userId: "dry-run" };
  }

  // Find or create demo user
  const userEmail = `demo-${workspaceSlug}@ducsigr.local`;
  let user = await prisma.user.findFirst({ where: { email: userEmail } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        id: crypto.randomUUID(),
        email: userEmail,
        name: `Demo User (${workspaceName})`,
      },
    });
    console.log(`  ✓ Created user: ${userEmail}`);
  }

  // Create workspace
  const workspace = await prisma.workspace.create({
    data: {
      name: workspaceName,
      slug: workspaceSlug,
      members: {
        create: { userId: user.id, role: "OWNER" },
      },
    },
  });
  console.log(`  ✓ Created workspace: ${workspace.name} (${workspace.slug})`);

  // Create project with API key
  const apiKeyPlaintext = generateApiKey();
  const hashedKey = hashApiKey(apiKeyPlaintext);

  const project = await prisma.project.create({
    data: {
      workspaceId: workspace.id,
      name: DEFAULT_CONFIG.project.name,
      apiKeys: {
        create: {
          name: DEFAULT_CONFIG.apiKey.name,
          hashedKey,
          displayKey: apiKeyPlaintext.substring(0, 8) + "...",
        },
      },
    },
  });
  console.log(`  ✓ Created project: ${project.name}`);

  console.log(`\n  ╔════════════════════════════════════════════════════════╗`);
  console.log(`  ║  API KEY (save this - shown only once):               ║`);
  console.log(`  ║  ${apiKeyPlaintext.padEnd(52)}  ║`);
  console.log(`  ╚════════════════════════════════════════════════════════╝\n`);

  return { workspaceId: workspace.id, projectId: project.id, apiKey: apiKeyPlaintext, userId: user.id };
}

async function seedPrompts(
  prisma: any,
  projectId: string,
  dryRun: boolean
): Promise<Record<string, Record<number, string>>> {
  console.log("━━━ Step 2/4: Prompts & Experiments ━━━\n");

  if (dryRun) {
    console.log("  [DRY RUN] Would create:");
    for (const p of PROMPTS_DATA) {
      console.log(`    - ${p.name} (${p.versions.length} versions)`);
    }
    console.log(`    - Experiment: ${EXPERIMENT_CONFIG.name}\n`);
    return {};
  }

  const versionIds: Record<string, Record<number, string>> = {};

  for (const promptData of PROMPTS_DATA) {
    const prompt = await prisma.prompt.create({
      data: {
        projectId,
        name: promptData.name,
        slug: promptData.slug,
        description: promptData.description,
        tags: promptData.tags,
      },
    });

    versionIds[promptData.slug] = {};

    for (const v of promptData.versions) {
      const checksum = generateChecksum(v.content, v.config);
      const version = await prisma.promptVersion.create({
        data: {
          promptId: prompt.id,
          version: v.version,
          type: v.type,
          content: v.content,
          variables: v.variables,
          config: v.config,
          checksum,
        },
      });

      versionIds[promptData.slug]![v.version] = version.id;

      for (const label of v.labels) {
        await prisma.promptLabel.create({
          data: { promptId: prompt.id, versionId: version.id, name: label },
        });
      }
    }
    console.log(`  ✓ ${promptData.name} (${promptData.versions.length} versions)`);
  }

  // Create experiment
  const supportReplyVersions = versionIds[EXPERIMENT_CONFIG.promptSlug];
  if (supportReplyVersions) {
    const versionAId = supportReplyVersions[EXPERIMENT_CONFIG.variantA.version];
    const versionBId = supportReplyVersions[EXPERIMENT_CONFIG.variantB.version];

    if (versionAId && versionBId) {
      await prisma.promptExperiment.create({
        data: {
          projectId,
          name: EXPERIMENT_CONFIG.name,
          slug: EXPERIMENT_CONFIG.slug,
          description: EXPERIMENT_CONFIG.description,
          status: "running",
          allocationPct: 100,
          assignmentKey: "userId",
          startedAt: new Date(),
          variants: {
            create: [
              { name: "A", promptVersionId: versionAId, weight: EXPERIMENT_CONFIG.variantA.weight, isControl: true },
              { name: "B", promptVersionId: versionBId, weight: EXPERIMENT_CONFIG.variantB.weight, isControl: false },
            ],
          },
        },
      });
      console.log(`  ✓ Experiment: ${EXPERIMENT_CONFIG.name}\n`);
    }
  }

  return versionIds;
}

async function seedKnowledgeBase(
  prisma: any,
  workspaceId: string,
  userId: string,
  dryRun: boolean
): Promise<void> {
  console.log("━━━ Step 3/4: Knowledge Base ━━━\n");

  if (dryRun) {
    console.log("  [DRY RUN] Would create:");
    console.log(`    - ${KNOWLEDGE_GROUPS.length} top-level groups`);
    console.log(`    - ${KNOWLEDGE_ARTICLES.length} articles\n`);
    return;
  }

  const groupIdMap = new Map<string, string>();

  for (const group of KNOWLEDGE_GROUPS) {
    const created = await prisma.knowledgeGroup.create({
      data: { workspaceId, name: group.name, description: group.description },
    });
    groupIdMap.set(group.name, created.id);

    if (group.children) {
      for (const child of group.children) {
        const childCreated = await prisma.knowledgeGroup.create({
          data: { workspaceId, name: child.name, description: child.description, parentId: created.id },
        });
        groupIdMap.set(child.name, childCreated.id);
      }
    }
  }
  console.log(`  ✓ Created ${groupIdMap.size} groups`);

  for (const article of KNOWLEDGE_ARTICLES) {
    const groupName = article.groupPath[article.groupPath.length - 1];
    const groupId = groupName ? groupIdMap.get(groupName) : null;

    const created = await prisma.knowledgeArticle.create({
      data: {
        workspaceId,
        groupId,
        title: article.title,
        slug: article.slug,
        summary: article.summary,
        content: article.content,
        tags: article.tags,
        status: "PUBLISHED",
        searchText: `${article.title} ${article.summary} ${article.content}`,
        createdById: userId,
        updatedById: userId,
      },
    });

    await prisma.knowledgeArticleVersion.create({
      data: {
        articleId: created.id,
        version: 1,
        title: article.title,
        summary: article.summary,
        content: article.content,
        tags: article.tags,
        checksum: sha256(article.content),
        createdById: userId,
      },
    });
  }
  console.log(`  ✓ Created ${KNOWLEDGE_ARTICLES.length} articles\n`);
}

async function generateTraces(
  projectId: string,
  apiKey: string,
  promptVersionIds: Record<string, Record<number, string>>,
  count: number,
  dryRun: boolean
): Promise<void> {
  console.log("━━━ Step 4/4: Generating Traces ━━━\n");

  if (dryRun) {
    console.log("  [DRY RUN] Would generate:");
    console.log(`    - ${count} traces`);
    console.log(`    - ~${count * 2} logs`);
    console.log(`    - Ingest URL: ${ENV.INGEST_URL}\n`);
    return;
  }

  const versionIdList = Object.values(promptVersionIds).flatMap((v) => Object.values(v)) as string[];

  console.log(`  Ingest URL: ${ENV.INGEST_URL}`);
  console.log(`  Generating ${count} traces...\n`);

  const traces: any[] = [];
  const logs: any[] = [];
  const scenarioCounts = { success: 0, slow: 0, error: 0, retry: 0 };

  for (let i = 0; i < count; i++) {
    const traceId = crypto.randomBytes(16).toString("hex");
    const rootSpanId = crypto.randomBytes(8).toString("hex");

    const roll = Math.random();
    let scenario: "success" | "slow" | "error" | "retry" = "success";
    let cumulative = 0;
    for (const [s, prob] of Object.entries(DEFAULT_CONFIG.traces.scenarios)) {
      cumulative += prob;
      if (roll < cumulative) {
        scenario = s as typeof scenario;
        break;
      }
    }
    scenarioCounts[scenario]++;

    const model = randomChoice(DEFAULT_CONFIG.traces.models);
    const hoursAgo = Math.random() * DEFAULT_CONFIG.traces.timeRangeHours;
    const startMs = Date.now() - hoursAgo * 60 * 60 * 1000;
    const startNano = (BigInt(Math.floor(startMs)) * BigInt(1_000_000)).toString();

    let latencyMs: number;
    if (scenario === "slow") latencyMs = randomInt(2000, 10000);
    else if (scenario === "error") latencyMs = randomInt(100, 500);
    else latencyMs = randomInt(200, 800);

    const endNano = (BigInt(startNano) + BigInt(latencyMs) * BigInt(1_000_000)).toString();
    const promptVersionId = versionIdList.length > 0 ? randomChoice(versionIdList) : undefined;

    traces.push({
      traceId,
      spanId: rootSpanId,
      name: "support-copilot-request",
      kind: 2,
      startTimeUnixNano: startNano,
      endTimeUnixNano: endNano,
      attributes: [
        { key: "service.name", value: { stringValue: "support-copilot" } },
        { key: "ducsigr.span.type", value: { stringValue: "default" } },
      ],
      status: scenario === "error" ? { code: 2, message: "Error" } : { code: 1 },
    });

    traces.push({
      traceId,
      spanId: crypto.randomBytes(8).toString("hex"),
      parentSpanId: rootSpanId,
      name: `chat ${model}`,
      kind: 3,
      startTimeUnixNano: startNano,
      endTimeUnixNano: endNano,
      attributes: [
        { key: "ducsigr.span.type", value: { stringValue: "llm" } },
        { key: "gen_ai.request.model", value: { stringValue: model } },
        { key: "gen_ai.usage.prompt_tokens", value: { intValue: String(randomInt(200, 800)) } },
        { key: "gen_ai.usage.completion_tokens", value: { intValue: String(randomInt(100, 500)) } },
        ...(promptVersionId ? [{ key: "ducsigr.prompt.version_id", value: { stringValue: promptVersionId } }] : []),
      ],
      status: scenario === "error" ? { code: 2, message: "Rate limit" } : { code: 1 },
    });

    logs.push({
      timeUnixNano: startNano,
      severityNumber: 9,
      severityText: "INFO",
      body: { stringValue: "Request started" },
      traceId,
      spanId: rootSpanId,
      attributes: [],
    });

    logs.push({
      timeUnixNano: endNano,
      severityNumber: scenario === "error" ? 17 : 9,
      severityText: scenario === "error" ? "ERROR" : "INFO",
      body: { stringValue: scenario === "error" ? "Request failed" : "Request completed" },
      traceId,
      spanId: rootSpanId,
      attributes: [],
    });

    if ((i + 1) % 200 === 0) console.log(`    Generated ${i + 1}/${count}`);
  }

  console.log("\n  Scenario distribution:");
  console.log(`    Success: ${scenarioCounts.success} (${((scenarioCounts.success / count) * 100).toFixed(1)}%)`);
  console.log(`    Slow: ${scenarioCounts.slow} (${((scenarioCounts.slow / count) * 100).toFixed(1)}%)`);
  console.log(`    Error: ${scenarioCounts.error} (${((scenarioCounts.error / count) * 100).toFixed(1)}%)`);
  console.log(`    Retry: ${scenarioCounts.retry} (${((scenarioCounts.retry / count) * 100).toFixed(1)}%)`);

  console.log("\n  Sending traces...");
  for (let i = 0; i < traces.length; i += DEFAULT_CONFIG.traces.batchSize * 2) {
    const batch = traces.slice(i, i + DEFAULT_CONFIG.traces.batchSize * 2);
    const payload = {
      resourceSpans: [{
        resource: { attributes: [{ key: "service.name", value: { stringValue: "support-copilot" } }] },
        scopeSpans: [{ scope: { name: "demo-seeder" }, spans: batch }],
      }],
    };

    const res = await fetch(`${ENV.INGEST_URL}/v1/traces`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(payload),
    });

    if (!res.ok) throw new Error(`Failed to send traces: ${res.status} ${await res.text()}`);
  }
  console.log(`    ✓ Traces sent`);

  console.log("  Sending logs...");
  const logPayload = {
    resourceLogs: [{
      resource: { attributes: [{ key: "service.name", value: { stringValue: "support-copilot" } }] },
      scopeLogs: [{ scope: { name: "demo-seeder" }, logRecords: logs }],
    }],
  };

  const logRes = await fetch(`${ENV.INGEST_URL}/v1/logs`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(logPayload),
  });

  if (!logRes.ok) throw new Error(`Failed to send logs: ${logRes.status} ${await logRes.text()}`);
  console.log(`    ✓ Logs sent (${logs.length})\n`);
}

// ============================================================
// Main
// ============================================================

async function main(): Promise<void> {
  const options = parseArgs();

  if (options.help) {
    printHelp();
    process.exit(0);
  }

  if (!options.workspaceName) {
    console.error("\n❌ ERROR: Workspace name is required\n");
    console.error("Usage:");
    console.error("  doppler run -- pnpm tsx scripts/demo/seed-demo.ts \"My Company\"\n");
    console.error("Run with --help for more options.\n");
    process.exit(1);
  }

  validateEnvironment();

  console.log("\n╔═══════════════════════════════════════════════════════════╗");
  console.log("║         Ducsigr Demo Seeding (Doppler)                    ║");
  console.log("╚═══════════════════════════════════════════════════════════╝\n");

  console.log("Configuration:");
  console.log(`  Doppler:      ${ENV.DOPPLER_PROJECT}/${ENV.DOPPLER_CONFIG}`);
  console.log(`  Workspace:    ${options.workspaceName} (${options.workspaceSlug})`);
  console.log(`  Ingest URL:   ${ENV.INGEST_URL}`);
  console.log(`  Trace count:  ${options.skipTraces ? "(skipped)" : options.traceCount}`);
  console.log(`  Dry run:      ${options.dryRun ? "Yes" : "No"}`);
  console.log(`  Reset:        ${options.reset ? "Yes" : "No"}`);

  const { prisma } = await import("../../packages/db/src/index.js");

  try {
    if (options.reset) {
      await cleanExistingData(prisma, options.workspaceSlug, options.dryRun);
    }

    const existing = await prisma.workspace.findUnique({ where: { slug: options.workspaceSlug } });
    if (existing && !options.reset) {
      console.log(`\n⚠ Workspace "${options.workspaceName}" already exists.`);
      console.log(`   Use --reset to delete and recreate.\n`);
      await prisma.$disconnect();
      process.exit(1);
    }

    const { workspaceId, projectId, apiKey, userId } = await seedWorkspaceAndProject(
      prisma,
      options.workspaceName,
      options.workspaceSlug,
      options.dryRun
    );

    const promptVersionIds = await seedPrompts(prisma, projectId, options.dryRun);
    await seedKnowledgeBase(prisma, workspaceId, userId, options.dryRun);

    if (!options.skipTraces && !options.dryRun) {
      await generateTraces(projectId, apiKey, promptVersionIds, options.traceCount, options.dryRun);
    } else if (options.skipTraces) {
      console.log("━━━ Step 4/4: Traces (Skipped) ━━━\n");
    }

    console.log("╔═══════════════════════════════════════════════════════════╗");
    console.log("║           ✅ Demo Seeding Complete!                       ║");
    console.log("╚═══════════════════════════════════════════════════════════╝\n");

    if (!options.dryRun) {
      console.log(`  Workspace:  ${options.workspaceName}`);
      console.log(`  Slug:       ${options.workspaceSlug}`);
      console.log(`  Project:    ${DEFAULT_CONFIG.project.name}`);
      console.log(`  URL:        http://localhost:3000/${options.workspaceSlug}`);
      console.log(`  API Key:    ${apiKey}`);
      console.log("");
    }

    await prisma.$disconnect();
  } catch (error) {
    console.error("\n❌ Error:", error instanceof Error ? error.message : error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

main();
