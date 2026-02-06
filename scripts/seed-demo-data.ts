/**
 * Demo Data Seeder for YC Demo
 *
 * Run with: pnpm tsx scripts/seed-demo-data.ts
 *
 * Creates realistic demo data including:
 * - Project with API key
 * - Traces with various states (success, errors, slow)
 * - Alerts (some firing, some resolved)
 * - Prompts with versions
 * - Knowledge base articles
 */

import { PrismaClient } from "@prisma/client";
import { randomUUID } from "crypto";

const prisma = new PrismaClient();

// Configuration
const DEMO_WORKSPACE_SLUG = "yc-demo";
const DEMO_PROJECT_NAME = "AI Assistant API";
const NUM_TRACES = 500;
const NUM_SPANS_PER_TRACE = 3;

// Realistic LLM data
const MODELS = ["gpt-4", "gpt-4-turbo", "gpt-3.5-turbo", "claude-3-opus", "claude-3-sonnet"];
const MODEL_COSTS = {
  "gpt-4": { input: 0.03, output: 0.06 },
  "gpt-4-turbo": { input: 0.01, output: 0.03 },
  "gpt-3.5-turbo": { input: 0.0005, output: 0.0015 },
  "claude-3-opus": { input: 0.015, output: 0.075 },
  "claude-3-sonnet": { input: 0.003, output: 0.015 },
};

const SPAN_NAMES = [
  "llm.completion",
  "embedding.create",
  "retrieval.search",
  "chain.run",
  "agent.execute",
  "tool.call",
];

const USER_PROMPTS = [
  "What are the key features of your product?",
  "How do I integrate the SDK?",
  "Can you help me debug this error?",
  "What's the pricing for enterprise?",
  "How does the alerting system work?",
  "Show me examples of trace visualization",
];

async function main() {
  console.log("🚀 Starting demo data seeding...\n");

  // 1. Find or create demo user
  let user = await prisma.user.findFirst({
    where: { email: { contains: "demo" } },
  });

  if (!user) {
    console.log("Creating demo user...");
    user = await prisma.user.create({
      data: {
        id: randomUUID(),
        email: "demo@ducsigr.dev",
        name: "Demo User",
      },
    });
  }
  console.log(`✅ User: ${user.email}`);

  // 2. Find or create demo workspace
  let workspace = await prisma.workspace.findUnique({
    where: { slug: DEMO_WORKSPACE_SLUG },
  });

  if (!workspace) {
    console.log("Creating demo workspace...");
    workspace = await prisma.workspace.create({
      data: {
        id: randomUUID(),
        name: "YC Demo",
        slug: DEMO_WORKSPACE_SLUG,
        members: {
          create: {
            userId: user.id,
            role: "OWNER",
          },
        },
      },
    });
  }
  console.log(`✅ Workspace: ${workspace.name} (${workspace.slug})`);

  // 3. Create demo project
  let project = await prisma.project.findFirst({
    where: {
      workspaceId: workspace.id,
      name: DEMO_PROJECT_NAME,
    },
  });

  if (!project) {
    console.log("Creating demo project...");
    project = await prisma.project.create({
      data: {
        id: randomUUID(),
        name: DEMO_PROJECT_NAME,
        workspaceId: workspace.id,
      },
    });
  }
  console.log(`✅ Project: ${project.name}`);

  // 4. Create API key for the project
  let apiKey = await prisma.apiKey.findFirst({
    where: { projectId: project.id },
  });

  if (!apiKey) {
    console.log("Creating API key...");
    apiKey = await prisma.apiKey.create({
      data: {
        id: randomUUID(),
        name: "Demo API Key",
        key: `dsg_demo_${randomUUID().replace(/-/g, "").slice(0, 24)}`,
        projectId: project.id,
      },
    });
  }
  console.log(`✅ API Key: ${apiKey.key.slice(0, 20)}...`);

  // 5. Generate traces
  console.log(`\n📊 Generating ${NUM_TRACES} traces...`);

  const now = Date.now();
  const dayInMs = 24 * 60 * 60 * 1000;

  for (let i = 0; i < NUM_TRACES; i++) {
    // Spread traces over the last 7 days
    const traceTime = now - Math.random() * 7 * dayInMs;
    const traceId = randomUUID();

    // Determine if this trace has an error (10% error rate)
    const hasError = Math.random() < 0.1;
    // Determine if this trace is slow (15% are slow)
    const isSlow = Math.random() < 0.15;

    const baseDuration = isSlow ? 3000 + Math.random() * 5000 : 200 + Math.random() * 1500;

    // Create trace
    await prisma.trace.create({
      data: {
        id: traceId,
        projectId: project.id,
        name: hasError ? "llm.completion (error)" : "llm.completion",
        timestamp: new Date(traceTime),
        status: hasError ? "ERROR" : "OK",
        durationMs: Math.round(baseDuration),
        metadata: {
          userPrompt: USER_PROMPTS[Math.floor(Math.random() * USER_PROMPTS.length)],
          sessionId: `session_${Math.floor(Math.random() * 100)}`,
        },
      },
    });

    // Create spans for this trace
    let spanStartTime = traceTime;
    for (let j = 0; j < NUM_SPANS_PER_TRACE; j++) {
      const spanId = randomUUID();
      const model = MODELS[Math.floor(Math.random() * MODELS.length)];
      const spanDuration = baseDuration / NUM_SPANS_PER_TRACE + Math.random() * 100;

      const inputTokens = Math.floor(100 + Math.random() * 900);
      const outputTokens = Math.floor(50 + Math.random() * 450);
      const costs = MODEL_COSTS[model as keyof typeof MODEL_COSTS];
      const totalCost = (inputTokens * costs.input + outputTokens * costs.output) / 1000;

      await prisma.span.create({
        data: {
          id: spanId,
          traceId: traceId,
          projectId: project.id,
          name: SPAN_NAMES[j % SPAN_NAMES.length],
          startTime: new Date(spanStartTime),
          endTime: new Date(spanStartTime + spanDuration),
          status: hasError && j === NUM_SPANS_PER_TRACE - 1 ? "ERROR" : "OK",
          attributes: {
            "llm.model": model,
            "llm.provider": model.startsWith("gpt") ? "openai" : "anthropic",
            "llm.temperature": 0.7,
            "llm.max_tokens": 1000,
          },
          input: {
            messages: [
              {
                role: "user",
                content: USER_PROMPTS[Math.floor(Math.random() * USER_PROMPTS.length)],
              },
            ],
          },
          output: hasError
            ? { error: "Rate limit exceeded" }
            : { response: "Here is a helpful response..." },
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens,
          cost: totalCost,
          model,
        },
      });

      spanStartTime += spanDuration;
    }

    if ((i + 1) % 100 === 0) {
      console.log(`  Created ${i + 1}/${NUM_TRACES} traces`);
    }
  }
  console.log(`✅ Created ${NUM_TRACES} traces with ${NUM_TRACES * NUM_SPANS_PER_TRACE} spans`);

  // 6. Create alerts
  console.log("\n🚨 Creating alerts...");

  const alerts = [
    {
      name: "High Error Rate",
      type: "ERROR_RATE",
      operator: "GREATER_THAN",
      threshold: 5,
      windowMinutes: 10,
      state: "FIRING",
      severity: "CRITICAL",
    },
    {
      name: "High Latency (P95)",
      type: "LATENCY_P95",
      operator: "GREATER_THAN",
      threshold: 3000,
      windowMinutes: 15,
      state: "INACTIVE",
      severity: "WARNING",
    },
    {
      name: "Cost Spike",
      type: "ERROR_RATE", // Placeholder - adjust based on your schema
      operator: "GREATER_THAN",
      threshold: 10,
      windowMinutes: 60,
      state: "RESOLVED",
      severity: "WARNING",
    },
  ];

  for (const alertData of alerts) {
    const existingAlert = await prisma.alert.findFirst({
      where: {
        projectId: project.id,
        name: alertData.name,
      },
    });

    if (!existingAlert) {
      await prisma.alert.create({
        data: {
          id: randomUUID(),
          projectId: project.id,
          ...alertData,
        },
      });
      console.log(`  ✅ Alert: ${alertData.name} (${alertData.state})`);
    }
  }

  // 7. Create knowledge base articles
  console.log("\n📚 Creating knowledge base articles...");

  const articles = [
    {
      title: "Debugging High Latency Issues",
      content: `# Debugging High Latency Issues

## Symptoms
- API response times > 3 seconds
- Increased timeout errors
- User complaints about slow responses

## Common Causes
1. **Model Selection**: GPT-4 is slower than GPT-3.5-turbo
2. **Prompt Length**: Long prompts increase processing time
3. **Rate Limiting**: Hitting API rate limits causes retries
4. **Network Issues**: Latency to API endpoints

## Resolution Steps
1. Check the trace span for the slow request
2. Review the model used and token count
3. Check for retry attempts in the span metadata
4. Consider switching to a faster model for non-critical requests

## Prevention
- Set up latency alerts with appropriate thresholds
- Use streaming for long responses
- Implement request queuing with priority`,
      status: "PUBLISHED",
    },
    {
      title: "Handling Rate Limit Errors",
      content: `# Handling Rate Limit Errors

## Overview
Rate limit errors (429) occur when you exceed API quotas.

## Identification
- Error code: 429 Too Many Requests
- Span status: ERROR
- Error message contains "rate limit"

## Mitigation
1. Implement exponential backoff
2. Use request queuing
3. Distribute load across multiple API keys
4. Consider upgrading API tier

## Code Example
\`\`\`typescript
const withRetry = async (fn, maxRetries = 3) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (e) {
      if (e.status === 429 && i < maxRetries - 1) {
        await sleep(Math.pow(2, i) * 1000);
        continue;
      }
      throw e;
    }
  }
};
\`\`\``,
      status: "PUBLISHED",
    },
  ];

  for (const article of articles) {
    const existingArticle = await prisma.knowledgeArticle.findFirst({
      where: {
        workspaceId: workspace.id,
        title: article.title,
      },
    });

    if (!existingArticle) {
      await prisma.knowledgeArticle.create({
        data: {
          id: randomUUID(),
          workspaceId: workspace.id,
          title: article.title,
          content: article.content,
          status: article.status,
          createdById: user.id,
        },
      });
      console.log(`  ✅ Article: ${article.title}`);
    }
  }

  // Summary
  console.log("\n" + "=".repeat(50));
  console.log("🎉 Demo data seeding complete!\n");
  console.log("Demo Environment:");
  console.log(`  Workspace: ${workspace.slug}`);
  console.log(`  Project: ${project.name}`);
  console.log(`  API Key: ${apiKey.key}`);
  console.log(`  URL: http://localhost:3000/workspace/${workspace.slug}`);
  console.log("\n" + "=".repeat(50));
}

main()
  .catch((e) => {
    console.error("Error seeding demo data:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
