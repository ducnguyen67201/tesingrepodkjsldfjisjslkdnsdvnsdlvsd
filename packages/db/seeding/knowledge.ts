/**
 * Knowledge Base Seeding
 *
 * Seeds knowledge groups and articles for documentation.
 */

import crypto from "crypto";
import { prisma } from "../src/index.js";

function sha256(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

interface KnowledgeGroupSeed {
  name: string;
  description: string;
  children?: KnowledgeGroupSeed[];
}

const KNOWLEDGE_GROUPS: KnowledgeGroupSeed[] = [
  {
    name: "Troubleshooting",
    description: "Common issues and their solutions",
    children: [
      { name: "LLM Errors", description: "Handling LLM provider errors" },
      { name: "Performance", description: "Performance optimization guides" },
      { name: "Integration", description: "Third-party integration issues" },
    ],
  },
  {
    name: "Runbooks",
    description: "Step-by-step operational procedures",
    children: [
      { name: "Incident Response", description: "How to respond to incidents" },
      { name: "Deployment", description: "Deployment procedures" },
    ],
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

interface KnowledgeArticleSeed {
  title: string;
  slug: string;
  summary: string;
  content: string;
  tags: string[];
  groupPath: string[];
}

const KNOWLEDGE_ARTICLES: KnowledgeArticleSeed[] = [
  {
    title: "Handling OpenAI Rate Limits",
    slug: "handling-openai-rate-limits",
    summary: "How to handle and prevent OpenAI API rate limit errors",
    content: `# Handling OpenAI Rate Limits

## Overview
OpenAI rate limits can cause your application to fail if not handled properly.

## Detection
- HTTP 429 status code
- Error message containing "rate_limit_exceeded"

## Prevention
1. Implement exponential backoff
2. Use rate limiting middleware
3. Queue requests with Bull/BullMQ

## Recovery
1. Log the error with context
2. Wait for retry-after period
3. Retry with exponential backoff
`,
    tags: ["openai", "rate-limits", "errors", "api"],
    groupPath: ["Troubleshooting", "LLM Errors"],
  },
  {
    title: "Optimizing LLM Latency",
    slug: "optimizing-llm-latency",
    summary: "Techniques to reduce LLM response latency in production",
    content: `# Optimizing LLM Latency

## Techniques

### 1. Streaming Responses
Enable streaming to show results progressively.

### 2. Caching
Cache common queries with semantic similarity lookup.

### 3. Model Selection
- Use smaller models for simple tasks
- Reserve larger models for complex reasoning

### 4. Prompt Optimization
- Keep prompts concise
- Use few-shot examples efficiently
`,
    tags: ["latency", "performance", "optimization", "streaming"],
    groupPath: ["Troubleshooting", "Performance"],
  },
  {
    title: "Incident Response Runbook",
    slug: "incident-response-runbook",
    summary: "Step-by-step guide for responding to production incidents",
    content: `# Incident Response Runbook

## Severity Levels
| Level | Description | Response Time |
|-------|-------------|---------------|
| P1 | Complete outage | Immediate |
| P2 | Major feature broken | 15 minutes |
| P3 | Minor feature broken | 1 hour |

## Response Steps
1. Acknowledge the alert
2. Assess impact
3. Mitigate immediately
4. Communicate to stakeholders
5. Resolve and document
6. Schedule post-mortem
`,
    tags: ["incident", "runbook", "operations", "on-call"],
    groupPath: ["Runbooks", "Incident Response"],
  },
  {
    title: "Writing Effective Prompts",
    slug: "writing-effective-prompts",
    summary: "Best practices for crafting prompts that get consistent results",
    content: `# Writing Effective Prompts

## Core Principles

### 1. Be Specific
Bad: "Summarize this"
Good: "Summarize in 3 bullet points focusing on key decisions"

### 2. Provide Context
- Role/persona for the AI
- Constraints and requirements
- Expected output format

### 3. Use Examples
Few-shot prompting improves consistency.

## Testing
- Test with diverse inputs
- Check edge cases
- Measure consistency
`,
    tags: ["prompts", "best-practices", "llm", "ai"],
    groupPath: ["Best Practices", "Prompt Engineering"],
  },
  {
    title: "Reducing LLM Costs",
    slug: "reducing-llm-costs",
    summary: "Strategies for optimizing LLM usage costs in production",
    content: `# Reducing LLM Costs

## Cost Drivers
1. Token count (input + output)
2. Model choice
3. Request volume

## Optimization Strategies

### 1. Right-size Your Model
| Task | Recommended Model |
|------|-------------------|
| Simple classification | GPT-3.5-turbo |
| Code generation | GPT-4 / Claude |
| Embeddings | text-embedding-3-small |

### 2. Reduce Token Usage
- Compress prompts
- Use shorter system prompts
- Limit output with max_tokens

### 3. Implement Caching
Cache responses with appropriate TTL.

### 4. Monitor Usage
- Set up cost alerts
- Track cost per feature
`,
    tags: ["costs", "optimization", "budget", "tokens"],
    groupPath: ["Best Practices", "Cost Optimization"],
  },
];

async function getDefaultWorkspace(): Promise<{ id: string; userId: string } | null> {
  const workspace = await prisma.workspace.findFirst({
    include: {
      members: {
        where: { role: "OWNER" },
        take: 1,
      },
    },
  });

  if (!workspace || workspace.members.length === 0) {
    return null;
  }

  return {
    id: workspace.id,
    userId: workspace.members[0]!.userId,
  };
}

async function seedKnowledgeGroups(
  workspaceId: string,
  groups: KnowledgeGroupSeed[],
  parentId: string | null = null
): Promise<Map<string, string>> {
  const groupIdMap = new Map<string, string>();

  for (const group of groups) {
    const existing = await prisma.knowledgeGroup.findFirst({
      where: {
        workspaceId,
        name: group.name,
        parentId,
      },
      select: { id: true },
    });

    let groupId: string;
    if (existing) {
      groupId = existing.id;
      console.log(`  [skip] Group: ${group.name}`);
    } else {
      const created = await prisma.knowledgeGroup.create({
        data: {
          workspaceId,
          name: group.name,
          description: group.description,
          parentId,
        },
        select: { id: true },
      });
      groupId = created.id;
      console.log(`  [create] Group: ${group.name}`);
    }

    groupIdMap.set(group.name, groupId);

    if (group.children) {
      const childMap = await seedKnowledgeGroups(workspaceId, group.children, groupId);
      childMap.forEach((id, name) => groupIdMap.set(name, id));
    }
  }

  return groupIdMap;
}

async function seedKnowledgeArticles(
  workspaceId: string,
  userId: string,
  groupIdMap: Map<string, string>
): Promise<void> {
  for (const article of KNOWLEDGE_ARTICLES) {
    const existing = await prisma.knowledgeArticle.findFirst({
      where: { workspaceId, slug: article.slug },
      select: { id: true },
    });

    if (existing) {
      console.log(`  [skip] Article: ${article.title}`);
      continue;
    }

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
      select: { id: true },
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

    console.log(`  [create] Article: ${article.title}`);
  }
}

export async function seedKnowledge(): Promise<void> {
  console.log("Seeding knowledge base...\n");

  const workspaceData = await getDefaultWorkspace();

  if (!workspaceData) {
    console.log("  No workspace found. Skipping knowledge base seeding.");
    console.log("  Run 'pnpm db:seed users' first to create a workspace.\n");
    return;
  }

  const { id: workspaceId, userId } = workspaceData;

  console.log(`  Using workspace: ${workspaceId}\n`);

  console.log("  --- Groups ---");
  const groupIdMap = await seedKnowledgeGroups(workspaceId, KNOWLEDGE_GROUPS);

  console.log("\n  --- Articles ---");
  await seedKnowledgeArticles(workspaceId, userId, groupIdMap);

  const groupCount = KNOWLEDGE_GROUPS.reduce(
    (acc, g) => acc + 1 + (g.children?.length ?? 0),
    0
  );

  console.log(`\n  Summary: ${groupCount} groups, ${KNOWLEDGE_ARTICLES.length} articles`);
}
