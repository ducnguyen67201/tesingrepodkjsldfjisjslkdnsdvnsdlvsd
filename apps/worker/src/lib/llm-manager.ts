/**
 * LLM Manager - Centralized LLM Client for Worker
 *
 * Singleton pattern for LLM Center instance shared across all activities.
 * Created once per worker process, reused across all workflow executions.
 *
 * Usage:
 *   import { getLLM } from "@/lib/llm-manager";
 *   const result = await getLLM().embed(["text"]);
 */

import {
  createLLMCenter,
  getConfig,
  type LLMCenter,
} from "@ducsigr/shared/llm";

// ============================================
// Singleton Instance
// ============================================

let _llmCenter: LLMCenter | null = null;

/**
 * Get the shared LLM Center instance.
 *
 * Creates the instance lazily on first call.
 * Subsequent calls return the same instance.
 *
 * @returns LLM Center instance
 */
export function getLLM(): LLMCenter {
  if (!_llmCenter) {
    console.log("[LLM Manager] Initializing LLM Center...");
    _llmCenter = createLLMCenter(getConfig());
    console.log("[LLM Manager] LLM Center initialized successfully");
  }
  return _llmCenter;
}

/**
 * Reset the LLM Center instance (for testing only).
 * @internal
 */
export function resetLLM(): void {
  if (_llmCenter) {
    _llmCenter.shutdown().catch(() => {});
    _llmCenter = null;
  }
}

/**
 * Shutdown the LLM Center instance.
 * Should be called during worker shutdown.
 */
export async function shutdownLLM(): Promise<void> {
  if (_llmCenter) {
    console.log("[LLM Manager] Shutting down LLM Center...");
    await _llmCenter.shutdown();
    _llmCenter = null;
    console.log("[LLM Manager] LLM Center shut down successfully");
  }
}
