/**
 * Model Selection for RCA Generation
 *
 * Re-exports from centralized LLM configuration.
 * See @/lib/llm-config.ts for full model registry and fallback chains.
 */

import { getRCAConfigBySeverity, type Severity } from "../../../../lib/llm-config";
export type { ModelConfig, Severity as AlertSeverity, TaskConfig } from "../../../../lib/llm-config";

/**
 * Get model config for RCA based on severity.
 * Returns the primary model from the task config.
 */
export function getModelForSeverity(severity: Severity) {
  const config = getRCAConfigBySeverity(severity);
  return config.primary;
}

/**
 * Get full RCA config (primary + fallbacks) for severity.
 */
export function getRCAConfig(severity: Severity) {
  return getRCAConfigBySeverity(severity);
}
