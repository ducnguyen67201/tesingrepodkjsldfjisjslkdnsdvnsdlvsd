/**
 * LLM Center - Configuration Exports
 *
 * Environment-aware configuration loader.
 */

import type { LLMCenterConfig } from "../config.types";
import { developmentConfig } from "./development";
import { productionConfig } from "./production";

export { developmentConfig } from "./development";
export { productionConfig } from "./production";

/**
 * Get the appropriate LLM config based on NODE_ENV.
 *
 * @returns LLM configuration for current environment
 *
 * @example
 * ```typescript
 * import { getConfig } from "@ducsigr/shared/llm/configs";
 * import { createLLMCenter } from "@ducsigr/shared/llm";
 *
 * const llm = createLLMCenter(getConfig());
 * ```
 */
export function getConfig(): LLMCenterConfig {
  const env = process.env.NODE_ENV ?? "development";

  switch (env) {
    case "production":
      return productionConfig;
    case "development":
    case "test":
    default:
      return developmentConfig;
  }
}

/**
 * Get config by name.
 *
 * @param name - Environment name
 * @returns LLM configuration
 */
export function getConfigByName(
  name: "development" | "production"
): LLMCenterConfig {
  switch (name) {
    case "production":
      return productionConfig;
    case "development":
    default:
      return developmentConfig;
  }
}
