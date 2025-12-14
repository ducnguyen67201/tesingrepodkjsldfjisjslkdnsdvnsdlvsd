/**
 * Generate RCA Activity
 *
 * Main activity for LLM-based Root Cause Analysis generation.
 * Uses LLM Center for structured output with Zod validation.
 */

import { getLLM } from "../../../../lib/llm-manager";
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
        provider,
        model,
        schema: LLMRCAOutputSchema,
        ...RCA_PROMPT_CONFIG,
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
