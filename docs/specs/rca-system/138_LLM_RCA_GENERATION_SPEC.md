# Issue #138: LLM-Based RCA Generation - Engineering Specification

**Ticket:** #138 [RCA Sprint 3] LLM-based RCA generation
**Epic:** #127 Automated RCA System
**Points:** 8
**Priority:** P0
**Dependencies:** #136 (Trace Analysis), #137 (Code Correlation)

---

## Overview

Create a Temporal activity that uses the centralized **LLM Center** to synthesize trace analysis and code correlations into a structured, actionable RCA (Root Cause Analysis) report.

**Acceptance Criteria:**
- [ ] Uses LLM Center with call-time model override based on severity
- [ ] Generates structured JSON output validated by Zod schema
- [ ] Includes confidence score (0-1)
- [ ] Suggests remediation steps (immediate and long-term)
- [ ] Cost per RCA < $0.05 average
- [ ] Handles LLM failures gracefully (LLM Center handles retries/fallbacks)
- [ ] Template-based fallback for LOW severity with minimal data

---

## LLM Center Integration

The activity uses the **centralized LLM Center** (`@ducsigr/shared/llm`) following established patterns:

```typescript
import { getLLM } from "@/lib/llm-manager";

// LLM Center provides:
// - Multi-provider support (OpenAI, Anthropic)
// - Smart routing with automatic fallbacks
// - Structured output validation via Zod schema
// - Usage tracking (tokens, cost)
// - Rate limiting and retry logic

const llm = getLLM();
const result = await llm.chat<LLMRCAOutput>(messages, {
  provider: "anthropic",                    // Call-time override
  model: "claude-3-5-sonnet-20241022",      // Call-time override
  schema: LLMRCAOutputSchema,               // Zod schema for validation
  temperature: 0.3,
  maxTokens: 1500,
});
```

**Model Selection by Severity** (using call-time options):
| Severity | Provider | Model | Est. Cost |
|----------|----------|-------|-----------|
| CRITICAL | anthropic | claude-3-5-sonnet-20241022 | ~$0.03 |
| HIGH | anthropic | claude-3-5-sonnet-20241022 | ~$0.03 |
| MEDIUM | anthropic | claude-3-5-haiku-20241022 | ~$0.005 |
| LOW | anthropic | claude-3-5-haiku-20241022 | ~$0.005 |
| LOW (minimal data) | - | Template (no LLM) | $0 |

---

## Prompt Organization

Prompts are organized per workflow/activity in a dedicated directory structure. This separates prompt content from activity logic, making prompts easy to iterate and test.

### Directory Structure

```
apps/worker/src/
├── prompts/                          # Centralized prompts directory
│   ├── index.ts                      # Re-exports all prompts
│   ├── types.ts                      # Shared prompt types
│   ├── rca/                          # RCA workflow prompts
│   │   ├── index.ts                  # RCA prompt exports
│   │   ├── generate-rca.prompt.ts    # generateRCA activity prompt
│   │   └── templates.ts              # Template-based fallback content
│   ├── anomaly/                      # Future: anomaly explanation prompts
│   │   └── explain-anomaly.prompt.ts
│   └── incident/                     # Future: incident summary prompts
│       └── summarize-incident.prompt.ts
```

### Prompt Module Pattern

Each activity's prompt is a module that exports:
1. **System prompt** - Role and guidelines for the LLM
2. **User prompt builder** - Function that takes input and builds the user message
3. **Prompt config** - Temperature, max tokens, etc.

```typescript
// apps/worker/src/prompts/rca/generate-rca.prompt.ts

import type { RCAGenerationInput } from "@/temporal/types";

/** Prompt configuration for generateRCA */
export const RCA_PROMPT_CONFIG = {
  temperature: 0.3,      // Low for consistent reasoning
  maxTokens: 1500,       // Sufficient for RCA output
} as const;

/** System prompt - defines LLM role and guidelines */
export const RCA_SYSTEM_PROMPT = `You are an expert Site Reliability Engineer (SRE) analyzing a production incident.

Your task is to analyze the provided trace data and code changes to identify the most likely root cause of the alert.

Guidelines:
1. Be specific and actionable in your hypothesis
2. Cite evidence from the provided data
3. Confidence should reflect certainty (0.9+ = very certain, 0.5-0.7 = moderate, <0.5 = uncertain)
4. Prioritize recent code changes when they correlate with the error patterns
5. Suggest practical remediation steps that engineers can act on immediately

Focus on accuracy over speculation. If the data is insufficient, acknowledge uncertainty.`;

/** Build user prompt from input data */
export function buildRCAUserPrompt(input: RCAGenerationInput): string {
  // Implementation builds structured prompt from input
  // (see full implementation in Step 3 below)
}
```

### Usage in Activity

```typescript
// apps/worker/src/temporal/activities/rca.activities.ts

import {
  RCA_SYSTEM_PROMPT,
  RCA_PROMPT_CONFIG,
  buildRCAUserPrompt,
} from "@/prompts/rca";

export async function generateRCA(input: RCAGenerationInput): Promise<RCAReport> {
  const llm = getLLM();

  const result = await llm.chat<LLMRCAOutput>(
    [
      { role: "system", content: RCA_SYSTEM_PROMPT },
      { role: "user", content: buildRCAUserPrompt(input) },
    ],
    {
      provider,
      model,
      schema: LLMRCAOutputSchema,
      ...RCA_PROMPT_CONFIG,  // temperature, maxTokens
    }
  );
}
```

### Benefits

| Benefit | Description |
|---------|-------------|
| **Separation of concerns** | Activity logic separate from prompt content |
| **Easy iteration** | Update prompts without touching activity code |
| **Testability** | Unit test prompt builders with mock data |
| **Reusability** | Share prompt patterns across activities |
| **Version control** | Track prompt changes in git history |

---

## Architecture Context

The `generateRCA` activity is the **third step** in the RCA workflow:

```
  Alert Fires (FIRING state)
         │
         ▼
  rcaWorkflow (Child Workflow)
         │
         ├─ 1. analyzeTraces Activity (#136) ✅ COMPLETE
         │      └─ Output: TraceAnalysisOutput
         │
         ├─ 2. correlateCodeChanges Activity (#137) ✅ COMPLETE
         │      └─ Output: CodeCorrelationOutput
         │
         ▼
  ┌─────────────────────────────────────────┐
  │  3. generateRCA Activity  ◀── THIS TICKET
  │                                         │
  │  Uses: LLM Center (getLLM())            │
  │                                         │
  │  Input:                                 │
  │    • RCAGenerationInput                 │
  │      - alertContext (severity, type)    │
  │      - traceAnalysis (from #136)        │
  │      - codeCorrelation (from #137)      │
  │                                         │
  │  Process:                               │
  │    1. Check template fallback           │
  │    2. Select model by severity          │
  │    3. Call llm.chat() with schema       │
  │    4. Return validated RCA report       │
  │                                         │
  │  Output: RCAReport                      │
  └─────────────────────────────────────────┘
         │
         ▼
    [storeRCA Activity (#139)]
```

---

## Implementation Plan

### Step 1: Add Types to `apps/worker/src/temporal/types.ts`

Add `RCAGenerationInput` and `RCAReport` interfaces:

```typescript
// ============================================================
// RCA GENERATION TYPES (for #138)
// ============================================================

/** Input for generateRCA activity */
export interface RCAGenerationInput {
  /** Alert context */
  alertContext: {
    alertId: string;
    alertHistoryId: string;
    alertName: string;
    projectId: string;
    projectName: string;
    alertType: RCAAlertType;
    severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
    currentValue: number;
    threshold: number;
    triggeredAt: string;  // ISO datetime
    windowMins: number;
  };
  /** Output from analyzeTraces activity */
  traceAnalysis: TraceAnalysisOutput;
  /** Output from correlateCodeChanges activity */
  codeCorrelation: CodeCorrelationOutput;
}

/** Root cause category */
export type RootCauseCategory =
  | "CODE_CHANGE"
  | "INFRASTRUCTURE"
  | "EXTERNAL_DEPENDENCY"
  | "DATA_ISSUE"
  | "CONFIGURATION"
  | "UNKNOWN";

/** Related change from commits/PRs */
export interface RelatedChange {
  /** ID (commit SHA or PR number) */
  changeId: string;
  /** Type of change */
  type: "commit" | "pr";
  /** Relevance level */
  relevance: "high" | "medium" | "low";
  /** Explanation of why this change is related */
  explanation: string;
}

/** RCA Report output */
export interface RCAReport {
  /** One-sentence hypothesis of the root cause */
  hypothesis: string;
  /** Confidence score (0-1) */
  confidence: number;
  /** Reasoning chain explaining the analysis */
  reasoning: string;
  /** Root cause details */
  rootCause: {
    /** Category of root cause */
    category: RootCauseCategory;
    /** Summary of the root cause */
    summary: string;
    /** Evidence supporting this conclusion */
    evidence: string[];
  };
  /** Changes related to this incident */
  relatedChanges: RelatedChange[];
  /** Affected system components */
  affectedComponents: string[];
  /** Remediation recommendations */
  remediation: {
    /** Immediate steps to mitigate the issue */
    immediate: string[];
    /** Long-term steps to prevent recurrence */
    longTerm: string[];
  };
  /** LLM metadata for cost tracking */
  llmMetadata: {
    model: string;
    provider: string;
    tokensUsed: number;
    estimatedCost: number;
    latencyMs: number;
    usedTemplate: boolean;
  };
}
```

---

### Step 2: Add Zod Schemas to `packages/api/src/schemas/rca.ts`

Add schemas for RCA generation. **Note:** Model selection uses LLM Center's call-time options, not hardcoded constants.

```typescript
// ============================================================
// RCA GENERATION SCHEMAS (for #138)
// ============================================================

/**
 * Root cause category enum
 */
export const RootCauseCategorySchema = z.enum([
  "CODE_CHANGE",
  "INFRASTRUCTURE",
  "EXTERNAL_DEPENDENCY",
  "DATA_ISSUE",
  "CONFIGURATION",
  "UNKNOWN",
]);
export type RootCauseCategory = z.infer<typeof RootCauseCategorySchema>;

/**
 * Related change relevance level
 */
export const RelevanceLevelSchema = z.enum(["high", "medium", "low"]);
export type RelevanceLevel = z.infer<typeof RelevanceLevelSchema>;

/**
 * Related change from commits/PRs
 */
export const RelatedChangeSchema = z.object({
  changeId: z.string().describe("Commit SHA or PR number"),
  type: z.enum(["commit", "pr"]),
  relevance: RelevanceLevelSchema,
  explanation: z.string().describe("Why this change is related to the incident"),
});
export type RelatedChange = z.infer<typeof RelatedChangeSchema>;

/**
 * Root cause details
 */
export const RootCauseSchema = z.object({
  category: RootCauseCategorySchema.describe("Category of root cause"),
  summary: z.string().describe("Brief summary of the root cause"),
  evidence: z.array(z.string()).describe("Evidence supporting this conclusion"),
});
export type RootCause = z.infer<typeof RootCauseSchema>;

/**
 * Remediation recommendations
 */
export const RemediationSchema = z.object({
  immediate: z.array(z.string()).describe("Steps to mitigate the issue now"),
  longTerm: z.array(z.string()).describe("Steps to prevent recurrence"),
});
export type Remediation = z.infer<typeof RemediationSchema>;

/**
 * LLM RCA output schema - passed to llm.chat() for structured output
 * LLM Center validates response against this schema automatically
 */
export const LLMRCAOutputSchema = z.object({
  hypothesis: z.string().describe(
    "One sentence stating the most likely root cause of the incident"
  ),
  confidence: z.number().min(0).max(1).describe(
    "Confidence score from 0 (no confidence) to 1 (certain)"
  ),
  reasoning: z.string().describe(
    "2-4 sentences explaining the reasoning chain"
  ),
  rootCause: RootCauseSchema,
  relatedChanges: z.array(RelatedChangeSchema).max(5),
  affectedComponents: z.array(z.string()).describe(
    "System components affected by this incident"
  ),
  remediation: RemediationSchema,
});
export type LLMRCAOutput = z.infer<typeof LLMRCAOutputSchema>;

/**
 * Alert context for RCA generation
 */
export const AlertContextSchema = z.object({
  alertId: z.string(),
  alertHistoryId: z.string(),
  alertName: z.string(),
  projectId: z.string(),
  projectName: z.string(),
  alertType: RCAAlertTypeSchema,
  severity: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]),
  currentValue: z.number(),
  threshold: z.number(),
  triggeredAt: z.string().datetime(),
  windowMins: z.number().positive(),
});
export type AlertContext = z.infer<typeof AlertContextSchema>;

/**
 * Input for generateRCA activity
 */
export const RCAGenerationInputSchema = z.object({
  alertContext: AlertContextSchema,
  traceAnalysis: TraceAnalysisOutputSchema,
  codeCorrelation: CodeCorrelationOutputSchema,
});
export type RCAGenerationInput = z.infer<typeof RCAGenerationInputSchema>;

/**
 * LLM metadata for cost tracking (populated from LLM Center result)
 */
export const LLMMetadataSchema = z.object({
  model: z.string(),
  provider: z.string(),
  tokensUsed: z.number().int().min(0),
  estimatedCost: z.number().min(0),
  latencyMs: z.number().int().min(0),
  usedTemplate: z.boolean(),
});
export type LLMMetadata = z.infer<typeof LLMMetadataSchema>;

/**
 * Full RCA Report output (LLM output + metadata)
 */
export const RCAReportSchema = LLMRCAOutputSchema.extend({
  llmMetadata: LLMMetadataSchema,
});
export type RCAReport = z.infer<typeof RCAReportSchema>;

// ============================================================
// TEMPLATE FALLBACK CONDITIONS
// ============================================================

/**
 * Template fallback conditions
 * Use template-based RCA (no LLM cost) when ALL conditions are met
 */
export const TEMPLATE_FALLBACK_CONDITIONS = {
  /** Only for LOW severity */
  maxSeverity: "LOW" as const,
  /** Maximum number of error patterns */
  maxErrorPatterns: 1,
  /** Maximum suspected commits (0 = no suspected commits) */
  maxSuspectedCommits: 0,
  /** Maximum anomalies */
  maxAnomalies: 0,
} as const;
```

---

### Step 3: Create Prompts Module in `apps/worker/src/prompts/`

Create the prompts directory structure for organized, per-activity prompts.

#### 3.1 Shared Types: `apps/worker/src/prompts/types.ts`

```typescript
/**
 * Shared Prompt Types
 *
 * Common types for all LLM prompts across activities.
 */

/** Prompt configuration passed to LLM Center */
export interface PromptConfig {
  /** Temperature for response randomness (0-1) */
  temperature: number;
  /** Maximum tokens in response */
  maxTokens: number;
}

/** Standard prompt module exports */
export interface PromptModule<TInput> {
  /** System prompt - defines LLM role */
  systemPrompt: string;
  /** Build user prompt from input */
  buildUserPrompt: (input: TInput) => string;
  /** LLM configuration */
  config: PromptConfig;
}
```

#### 3.2 RCA Prompt: `apps/worker/src/prompts/rca/generate-rca.prompt.ts`

```typescript
/**
 * RCA Generation Prompt
 *
 * Prompt configuration for the generateRCA activity.
 */

import type { RCAGenerationInput } from "@/temporal/types";
import type { PromptConfig } from "../types";

// ============================================
// Configuration
// ============================================

/** Prompt configuration for generateRCA */
export const RCA_PROMPT_CONFIG: PromptConfig = {
  temperature: 0.3,      // Low for consistent reasoning
  maxTokens: 1500,       // Sufficient for RCA output
};

// ============================================
// System Prompt
// ============================================

/** System prompt - defines LLM role and guidelines */
export const RCA_SYSTEM_PROMPT = `You are an expert Site Reliability Engineer (SRE) analyzing a production incident.

Your task is to analyze the provided trace data and code changes to identify the most likely root cause of the alert.

Guidelines:
1. Be specific and actionable in your hypothesis
2. Cite evidence from the provided data
3. Confidence should reflect certainty (0.9+ = very certain, 0.5-0.7 = moderate, <0.5 = uncertain)
4. Prioritize recent code changes when they correlate with the error patterns
5. Suggest practical remediation steps that engineers can act on immediately

Focus on accuracy over speculation. If the data is insufficient, acknowledge uncertainty.`;

// ============================================
// User Prompt Builder
// ============================================

/** Build user prompt from RCA generation input */
export function buildRCAUserPrompt(input: RCAGenerationInput): string {
  const { alertContext, traceAnalysis, codeCorrelation } = input;
  const { summary, errorPatterns, affectedEndpoints, anomalies } = traceAnalysis;
  const { suspectedCommits, suspectedPRs } = codeCorrelation;

  const sections: string[] = [];

  // Alert context
  sections.push(`## Alert Context
- **Alert Name:** ${alertContext.alertName}
- **Type:** ${alertContext.alertType}
- **Severity:** ${alertContext.severity}
- **Current Value:** ${alertContext.currentValue}
- **Threshold:** ${alertContext.threshold}
- **Triggered At:** ${alertContext.triggeredAt}
- **Analysis Window:** ${alertContext.windowMins} minutes`);

  // Trace analysis summary
  sections.push(`## Trace Analysis Summary
- **Total Traces:** ${summary.totalTraces}
- **Total Spans:** ${summary.totalSpans}
- **Error Count:** ${summary.errorCount} (${(summary.errorRate * 100).toFixed(1)}% error rate)
- **Latency P50:** ${summary.latencyP50.toFixed(0)}ms
- **Latency P95:** ${summary.latencyP95.toFixed(0)}ms
- **Latency P99:** ${summary.latencyP99.toFixed(0)}ms`);

  // Error patterns (top 5)
  if (errorPatterns.length > 0) {
    const patterns = errorPatterns.slice(0, 5).map((e, i) =>
      `${i + 1}. "${e.message}" - ${e.count} occurrences (${e.percentage.toFixed(1)}%)${e.stackTrace ? `\n   Stack: ${e.stackTrace.slice(0, 200)}...` : ""}`
    ).join("\n");
    sections.push(`## Top Error Patterns\n${patterns}`);
  }

  // Affected endpoints (top 5)
  if (affectedEndpoints.length > 0) {
    const endpoints = affectedEndpoints.slice(0, 5).map((e) =>
      `- ${e.name}: ${e.errorCount} errors (${(e.errorRate * 100).toFixed(1)}%), P95: ${e.latencyP95.toFixed(0)}ms`
    ).join("\n");
    sections.push(`## Affected Endpoints\n${endpoints}`);
  }

  // Anomalies
  if (anomalies.length > 0) {
    const anomalyList = anomalies.map((a) =>
      `- [${a.severity.toUpperCase()}] ${a.type}: ${a.description}`
    ).join("\n");
    sections.push(`## Detected Anomalies\n${anomalyList}`);
  }

  // Suspected commits (top 5)
  if (suspectedCommits.length > 0) {
    const commits = suspectedCommits.slice(0, 5).map((c) =>
      `- ${c.sha.slice(0, 7)}: "${c.message}" by ${c.author} (score: ${c.score.toFixed(2)})\n  Signals: temporal=${c.signals.temporal.toFixed(2)}, semantic=${c.signals.semantic.toFixed(2)}, pathMatch=${c.signals.pathMatch.toFixed(2)}`
    ).join("\n");
    sections.push(`## Suspected Commits\n${commits}`);
  } else if (codeCorrelation.hasRepository) {
    sections.push(`## Suspected Commits\nNo commits with significant correlation found in the lookback window.`);
  } else {
    sections.push(`## Suspected Commits\nNo GitHub repository linked to this project.`);
  }

  // Suspected PRs (top 3)
  if (suspectedPRs.length > 0) {
    const prs = suspectedPRs.slice(0, 3).map((pr) =>
      `- PR #${pr.number}: "${pr.title}" by ${pr.author} (score: ${pr.score.toFixed(2)})`
    ).join("\n");
    sections.push(`## Suspected Pull Requests\n${prs}`);
  }

  // Instructions
  sections.push(`## Instructions
Analyze the above data and provide:
1. A clear hypothesis of the root cause
2. Your confidence level (0-1) based on evidence strength
3. The root cause category and supporting evidence
4. Related changes (commits/PRs) with relevance explanations
5. Immediate and long-term remediation steps

Respond with a structured analysis following the provided schema.`);

  return sections.join("\n\n");
}
```

#### 3.3 Template Content: `apps/worker/src/prompts/rca/templates.ts`

```typescript
/**
 * RCA Template Content
 *
 * Static content for template-based RCA fallback.
 */

/** Generic remediation steps for template-based RCA */
export const TEMPLATE_REMEDIATION = {
  immediate: [
    "Review recent deployments and consider rollback if issue persists",
    "Check application health dashboards for additional signals",
    "Monitor error rates over the next 30 minutes",
  ],
  longTerm: [
    "Add more granular monitoring for the affected endpoints",
    "Consider implementing circuit breakers for failing operations",
    "Review and improve test coverage for affected code paths",
  ],
} as const;

/** Default reasoning for template-based RCA */
export const TEMPLATE_REASONING = {
  costOptimization:
    "Template-based analysis used for cost optimization on low-severity alert with minimal data.",
  errorFallback:
    "LLM analysis failed. This is a template-based analysis with limited insights.",
} as const;

/** Default confidence for template-based RCA */
export const TEMPLATE_CONFIDENCE = 0.3;
```

#### 3.4 RCA Index: `apps/worker/src/prompts/rca/index.ts`

```typescript
/**
 * RCA Prompts - Public Exports
 */

export {
  RCA_SYSTEM_PROMPT,
  RCA_PROMPT_CONFIG,
  buildRCAUserPrompt,
} from "./generate-rca.prompt";

export {
  TEMPLATE_REMEDIATION,
  TEMPLATE_REASONING,
  TEMPLATE_CONFIDENCE,
} from "./templates";
```

#### 3.5 Root Index: `apps/worker/src/prompts/index.ts`

```typescript
/**
 * Prompts - Public Exports
 *
 * Centralized prompts for all LLM-based activities.
 */

// Shared types
export type { PromptConfig, PromptModule } from "./types";

// RCA prompts
export * from "./rca";
```

---

### Step 4: Implement Activity in `apps/worker/src/temporal/activities/rca.activities.ts`

Add the `generateRCA` activity using LLM Center and prompts module:

```typescript
import { getLLM } from "@/lib/llm-manager";
import {
  // Prompts module - per-activity prompts
  RCA_SYSTEM_PROMPT,
  RCA_PROMPT_CONFIG,
  buildRCAUserPrompt,
  TEMPLATE_REMEDIATION,
  TEMPLATE_REASONING,
  TEMPLATE_CONFIDENCE,
} from "@/prompts/rca";
import {
  LLMRCAOutputSchema,
  TEMPLATE_FALLBACK_CONDITIONS,
  type LLMRCAOutput,
} from "@ducsigr/api/schemas";
import type {
  RCAGenerationInput,
  RCAReport,
  RelatedChange,
} from "../types";

// ============================================
// Model Selection (using LLM Center call-time options)
// ============================================

/**
 * Get model configuration based on alert severity.
 * Uses LLM Center's call-time override pattern.
 *
 * Models from production config (packages/shared/src/llm/configs/production.ts):
 * - CLAUDE_SONNET: claude-3-5-sonnet-20241022
 * - CLAUDE_HAIKU: claude-3-5-haiku-20241022
 */
function getModelForSeverity(severity: string): { provider: "anthropic"; model: string } {
  switch (severity) {
    case "CRITICAL":
    case "HIGH":
      return { provider: "anthropic", model: "claude-3-5-sonnet-20241022" };
    case "MEDIUM":
    case "LOW":
    default:
      return { provider: "anthropic", model: "claude-3-5-haiku-20241022" };
  }
}

// ============================================
// Activity: Generate RCA
// ============================================

/**
 * Generates a Root Cause Analysis report using LLM Center.
 *
 * Prompts are organized in the prompts module:
 * - RCA_SYSTEM_PROMPT: Role and guidelines for the LLM
 * - buildRCAUserPrompt(): Builds structured user prompt from input
 * - RCA_PROMPT_CONFIG: Temperature, max tokens config
 *
 * LLM Center handles:
 * - Provider abstraction (OpenAI, Anthropic)
 * - Automatic retries with exponential backoff
 * - Fallback chains on transient errors
 * - Schema validation for structured output
 * - Usage tracking (tokens, cost)
 *
 * @param input - RCA generation input with alert context and analysis data
 * @returns Structured RCA report with confidence and remediation steps
 */
export async function generateRCA(
  input: RCAGenerationInput
): Promise<RCAReport> {
  const { alertContext } = input;
  const startTime = Date.now();

  console.log(
    `[generateRCA] Starting RCA for alert ${alertContext.alertName} (${alertContext.severity})`
  );

  // 1. Check if template fallback applies
  if (shouldUseTemplate(input)) {
    console.log(`[generateRCA] Using template-based RCA (cost optimization)`);
    return generateTemplateRCA(input, startTime);
  }

  // 2. Select model based on severity (call-time override)
  const { provider, model } = getModelForSeverity(alertContext.severity);
  console.log(`[generateRCA] Using model: ${provider}/${model}`);

  // 3. Build prompt from prompts module
  const systemPrompt = RCA_SYSTEM_PROMPT;
  const userPrompt = buildRCAUserPrompt(input);

  // 4. Call LLM Center with structured output
  const llm = getLLM();

  try {
    const result = await llm.chat<LLMRCAOutput>(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      {
        provider,                          // Call-time override
        model,                             // Call-time override
        schema: LLMRCAOutputSchema,        // Zod schema for validation
        ...RCA_PROMPT_CONFIG,              // temperature, maxTokens from prompts module
      }
    );

    const latencyMs = Date.now() - startTime;

    console.log(
      `[generateRCA] LLM response received in ${latencyMs}ms ` +
        `(${result.usage.totalTokens} tokens, $${result.usage.estimatedCost.toFixed(4)})`
    );

    // 5. Return validated report with metadata from LLM Center
    return {
      ...result.data,
      llmMetadata: {
        model: result.model,
        provider: result.provider,
        tokensUsed: result.usage.totalTokens,
        estimatedCost: result.usage.estimatedCost,
        latencyMs,
        usedTemplate: false,
      },
    };
  } catch (error) {
    // LLM Center already handles retries and fallbacks
    // This catches non-retryable errors (auth, schema validation, etc.)
    console.error(`[generateRCA] LLM call failed:`, error);

    // Fallback to template on LLM failure
    console.log(`[generateRCA] Falling back to template due to LLM error`);
    return generateTemplateRCA(input, startTime, true);
  }
}

// ============================================
// Helper Functions
// ============================================

/**
 * Check if template-based RCA should be used (cost optimization)
 */
function shouldUseTemplate(input: RCAGenerationInput): boolean {
  const { alertContext, traceAnalysis, codeCorrelation } = input;
  const { severity } = alertContext;
  const conditions = TEMPLATE_FALLBACK_CONDITIONS;

  // Only LOW severity qualifies
  if (severity !== conditions.maxSeverity) return false;

  // Check data thresholds
  const hasMinimalErrors =
    traceAnalysis.errorPatterns.length <= conditions.maxErrorPatterns;
  const hasNoSuspectedCommits =
    codeCorrelation.suspectedCommits.length <= conditions.maxSuspectedCommits;
  const hasNoAnomalies =
    traceAnalysis.anomalies.length <= conditions.maxAnomalies;

  return hasMinimalErrors && hasNoSuspectedCommits && hasNoAnomalies;
}

/**
 * Generate template-based RCA (no LLM cost)
 */
function generateTemplateRCA(
  input: RCAGenerationInput,
  startTime: number,
  isErrorFallback = false
): RCAReport {
  const { alertContext, traceAnalysis, codeCorrelation } = input;

  // Build hypothesis from available data
  const topError = traceAnalysis.errorPatterns[0];
  const topCommit = codeCorrelation.suspectedCommits[0];

  let hypothesis: string;
  let category: RCAReport["rootCause"]["category"] = "UNKNOWN";
  const evidence: string[] = [];

  if (topError) {
    hypothesis = `Elevated ${alertContext.alertType.toLowerCase().replace("_", " ")} likely caused by: ${topError.message.slice(0, 100)}`;
    evidence.push(`Error occurred ${topError.count} times (${topError.percentage.toFixed(1)}% of errors)`);
    category = "CODE_CHANGE";
  } else if (topCommit) {
    hypothesis = `Recent code change may have introduced the issue: ${topCommit.message.slice(0, 100)}`;
    evidence.push(`Commit ${topCommit.sha.slice(0, 7)} by ${topCommit.author} (correlation score: ${topCommit.score.toFixed(2)})`);
    category = "CODE_CHANGE";
  } else {
    hypothesis = `${alertContext.alertType.replace("_", " ")} threshold exceeded. Further investigation needed.`;
    category = "UNKNOWN";
  }

  // Build related changes
  const relatedChanges: RelatedChange[] = codeCorrelation.suspectedCommits
    .slice(0, 3)
    .map((commit) => ({
      changeId: commit.sha,
      type: "commit" as const,
      relevance: commit.score > 0.7 ? "high" : commit.score > 0.4 ? "medium" : "low",
      explanation: `Commit "${commit.message.slice(0, 50)}..." has correlation score ${commit.score.toFixed(2)}`,
    }));

  // Add PRs
  codeCorrelation.suspectedPRs.slice(0, 2).forEach((pr) => {
    relatedChanges.push({
      changeId: String(pr.number),
      type: "pr" as const,
      relevance: pr.score > 0.7 ? "high" : pr.score > 0.4 ? "medium" : "low",
      explanation: `PR #${pr.number} "${pr.title.slice(0, 50)}..." merged recently`,
    });
  });

  const latencyMs = Date.now() - startTime;

  return {
    hypothesis,
    confidence: TEMPLATE_CONFIDENCE,  // From prompts module
    reasoning: isErrorFallback
      ? TEMPLATE_REASONING.errorFallback    // From prompts module
      : TEMPLATE_REASONING.costOptimization,
    rootCause: {
      category,
      summary: hypothesis,
      evidence,
    },
    relatedChanges,
    affectedComponents: traceAnalysis.affectedEndpoints.slice(0, 5).map((e) => e.name),
    remediation: TEMPLATE_REMEDIATION,  // From prompts module
    llmMetadata: {
      model: "template",
      provider: "none",
      tokensUsed: 0,
      estimatedCost: 0,
      latencyMs,
      usedTemplate: true,
    },
  };
}

// NOTE: buildSystemPrompt() and buildRCAUserPrompt() are now in
// the prompts module: @/prompts/rca/generate-rca.prompt.ts
// See Step 3 for the full implementation.
```

---

### Step 5: Export Activity in `apps/worker/src/temporal/activities/index.ts`

Update exports:

```typescript
// RCA (Root Cause Analysis) activities
export { analyzeTraces, correlateCodeChanges, generateRCA } from "./rca.activities";
```

---

## Files Summary

| File | Action | Description |
|------|--------|-------------|
| `apps/worker/src/temporal/types.ts` | MODIFY | Add `RCAGenerationInput`, `RCAReport`, and related types |
| `packages/api/src/schemas/rca.ts` | MODIFY | Add Zod schemas for LLM output validation |
| `apps/worker/src/prompts/types.ts` | CREATE | Shared prompt types |
| `apps/worker/src/prompts/rca/generate-rca.prompt.ts` | CREATE | RCA generation prompt (system, user builder, config) |
| `apps/worker/src/prompts/rca/templates.ts` | CREATE | Template-based fallback content |
| `apps/worker/src/prompts/rca/index.ts` | CREATE | RCA prompts exports |
| `apps/worker/src/prompts/index.ts` | CREATE | Root prompts exports |
| `apps/worker/src/temporal/activities/rca.activities.ts` | MODIFY | Add `generateRCA` activity |
| `apps/worker/src/temporal/activities/index.ts` | MODIFY | Export `generateRCA` |

---

## Cost Analysis

### Model Pricing (per 1M tokens)

| Model | Input | Output | Typical RCA Cost |
|-------|-------|--------|------------------|
| Claude 3.5 Sonnet | $3.00 | $15.00 | ~$0.02-0.04 |
| Claude 3.5 Haiku | $0.80 | $4.00 | ~$0.003-0.008 |
| Template | $0 | $0 | $0 |

### Estimated Token Usage per RCA

| Component | Tokens |
|-----------|--------|
| System Prompt | ~150 |
| User Prompt (analysis data) | ~500-1000 |
| LLM Output | ~300-500 |
| **Total** | ~1000-1500 |

### Cost Projections by Severity Mix

Assuming 100 alerts/month with typical severity distribution:
- CRITICAL (5%): 5 alerts × $0.03 = $0.15
- HIGH (15%): 15 alerts × $0.03 = $0.45
- MEDIUM (30%): 30 alerts × $0.005 = $0.15
- LOW (50%): 50 alerts × $0 (template) = $0.00

**Monthly Total: ~$0.75** (well under $0.05/RCA average target)

---

## Error Handling

### LLM Failures

The activity handles LLM failures gracefully:

1. **Schema Validation Failure**: Zod validates LLM output; invalid responses trigger retry
2. **Rate Limit**: LLM Center handles automatic retry with exponential backoff
3. **Timeout**: Falls back to template-based RCA
4. **Provider Error**: Falls back to template-based RCA

### Fallback Behavior

When LLM fails, `generateTemplateRCA` is called with `isErrorFallback=true`:
- Confidence is set to 0.3 (low)
- Reasoning indicates LLM failure
- Generic remediation steps are provided

---

## Testing Strategy

### Unit Tests

1. **Prompts Module**
   - `buildRCAUserPrompt()`: Test prompt generation with various input scenarios
   - `RCA_PROMPT_CONFIG`: Verify temperature and maxTokens values
   - `TEMPLATE_REMEDIATION`: Verify template content structure

2. **Activity Functions**
   - `shouldUseTemplate()`: Test all condition combinations
   - `generateTemplateRCA()`: Test template output structure
   - `getModelForSeverity()`: Test model selection for each severity

### Integration Tests

1. **LLM Integration**: Mock LLM Center to test schema validation
2. **Full Activity**: Test with real TraceAnalysisOutput and CodeCorrelationOutput
3. **Prompts Integration**: Verify prompts module exports are correctly imported

### Manual Validation

1. Generate RCAs for sample alerts and validate:
   - Hypothesis accuracy
   - Confidence calibration
   - Remediation relevance
   - Prompt quality (review system/user prompts)

---

## Definition of Done

- [ ] Prompts module created (`apps/worker/src/prompts/`)
- [ ] RCA prompts implemented (`generate-rca.prompt.ts`, `templates.ts`)
- [ ] `generateRCA` activity implemented and exported
- [ ] Types defined in `types.ts`
- [ ] Zod schemas created for LLM output validation
- [ ] Model selection based on severity (Sonnet for CRITICAL/HIGH, Haiku for MEDIUM/LOW)
- [ ] Template-based fallback for LOW severity with minimal data
- [ ] Error handling with graceful fallback
- [ ] Prompt includes trace analysis, code correlations, and alert context
- [ ] Output includes `llmMetadata` for cost tracking
- [ ] Cost per RCA < $0.05 average verified
- [ ] Activity can be called from workflow

---

## Sequence Diagram

```
┌─────────┐     ┌───────────────┐     ┌───────────┐     ┌─────────────┐
│ Workflow│     │  generateRCA  │     │ LLM Center│     │  Anthropic  │
└────┬────┘     └───────┬───────┘     └─────┬─────┘     └──────┬──────┘
     │                  │                   │                  │
     │ generateRCA(input)                   │                  │
     │─────────────────▶│                   │                  │
     │                  │                   │                  │
     │                  │ shouldUseTemplate?│                  │
     │                  │───────────┐       │                  │
     │                  │           │       │                  │
     │                  │◀──────────┘       │                  │
     │                  │                   │                  │
     │                  │ [if template]     │                  │
     │                  │ return template   │                  │
     │◀─────────────────│                   │                  │
     │                  │                   │                  │
     │                  │ [if LLM]          │                  │
     │                  │ llm.chat(prompt, schema)             │
     │                  │──────────────────▶│                  │
     │                  │                   │                  │
     │                  │                   │ API call         │
     │                  │                   │─────────────────▶│
     │                  │                   │                  │
     │                  │                   │ structured response
     │                  │                   │◀─────────────────│
     │                  │                   │                  │
     │                  │ validated result  │                  │
     │                  │◀──────────────────│                  │
     │                  │                   │                  │
     │ RCAReport        │                   │                  │
     │◀─────────────────│                   │                  │
     │                  │                   │                  │
```

---

## References

- [LLM Center Documentation](../../LLM_CENTER.md)
- [Sprint 3 RCA Engine Spec](./136_SPRINT_3_RCA_ENGINE_SPEC.md)
- [Issue #136 - Trace Analysis](./136_SPRINT_3_RCA_ENGINE_SPEC.md#story-1-trace-analysis-activity)
- [Issue #137 - Code Correlation](./136_SPRINT_3_RCA_ENGINE_SPEC.md#story-2-code-correlation-activity)
