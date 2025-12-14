/**
 * Generate RCA Activity
 *
 * Main activity for LLM-based Root Cause Analysis generation.
 * Uses LLM Center for structured output with Zod validation.
 */

import { getLLM } from "../../../../lib/llm-manager";
import { getLogger } from "@cognobserve/shared/llm";
import {
  RCA_SYSTEM_PROMPT,
  RCA_PROMPT_CONFIG,
  buildRCAUserPrompt,
} from "../../../../prompts/rca";
import {
  LLMRCAOutputSchema,
  type LLMRCAOutput,
} from "@cognobserve/api/schemas";
import type { RCAGenerationInput, RCAReport } from "../../../types";
import { getModelForSeverity } from "./model-selection";
import { shouldUseTemplate, generateTemplateRCA } from "./template";

const logger = getLogger();

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

  logger.info("[generateRCA] Starting RCA generation", {
    alertName: alertContext.alertName,
    severity: alertContext.severity,
    alertType: alertContext.alertType,
  });

  // 1. Check if template fallback applies
  if (shouldUseTemplate(input)) {
    logger.info("[generateRCA] Using template-based RCA (cost optimization)");
    return generateTemplateRCA(input, startTime);
  }

  // 2. Select model based on severity (call-time override)
  const { provider, model } = getModelForSeverity(alertContext.severity);
  logger.info("[generateRCA] Model selected", { provider, model });

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
        provider,
        model,
        schema: LLMRCAOutputSchema,
        ...RCA_PROMPT_CONFIG,
      }
    );

    const latencyMs = Date.now() - startTime;

    logger.info("[generateRCA] LLM response received", {
      latencyMs,
      tokensUsed: result.usage.totalTokens,
      estimatedCost: result.usage.estimatedCost,
    });

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
    logger.error("[generateRCA] LLM call failed", { error });

    // Fallback to template on LLM failure
    logger.info("[generateRCA] Falling back to template due to LLM error");
    return generateTemplateRCA(input, startTime, true);
  }
}
