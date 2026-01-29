/**
 * LLM Center - Base Provider Class
 *
 * Abstract base class that all LLM providers extend.
 * Provides common functionality for schema parsing and validation.
 */

import type { z } from "zod";
import type {
  LLMProvider,
  ProviderName,
  EmbedOptions,
  EmbedResult,
  CompleteOptions,
  CompleteResult,
  ChatOptions,
  ChatResult,
  Message,
} from "../types";
import { SchemaValidationError } from "../errors";
import { sleep } from "../utils";

/**
 * Base class for LLM providers.
 *
 * Provides:
 * - Schema parsing and validation
 * - Common utility methods
 * - Default implementations for optional methods
 */
export abstract class BaseLLMProvider implements LLMProvider {
  abstract readonly name: ProviderName;

  abstract embed(texts: string[], options?: EmbedOptions): Promise<EmbedResult>;

  abstract complete<T>(
    prompt: string,
    options?: CompleteOptions<z.ZodType<T>>
  ): Promise<CompleteResult<T>>;

  abstract chat<T>(
    messages: Message[],
    options?: ChatOptions<z.ZodType<T>>
  ): Promise<ChatResult<T>>;

  /**
   * Initialize provider (optional override).
   */
  async initialize(): Promise<void> {
    // Default: no-op
  }

  /**
   * Shutdown provider (optional override).
   */
  async shutdown(): Promise<void> {
    // Default: no-op
  }

  /**
   * Parse and validate response against Zod schema.
   *
   * @param response - Raw response string
   * @param schema - Zod schema to validate against
   * @returns Validated and typed data
   * @throws SchemaValidationError if validation fails
   */
  protected parseWithSchema<T>(response: string, schema: z.ZodType<T>): T {
    // Try to parse as JSON first
    let parsed: unknown;

    try {
      parsed = JSON.parse(response);
    } catch {
      // If not valid JSON, try to extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0]);
        } catch {
          throw new SchemaValidationError(
            this.name,
            "unknown",
            ["Response is not valid JSON"],
            new Error("JSON parse failed")
          );
        }
      } else {
        throw new SchemaValidationError(
          this.name,
          "unknown",
          ["Response does not contain JSON"],
          new Error("No JSON found in response")
        );
      }
    }

    // Validate against schema
    const result = schema.safeParse(parsed);

    if (!result.success) {
      // Zod 4 uses 'issues' instead of 'errors'
      const errors = result.error.issues.map(
        (issue) => `${issue.path.join(".")}: ${issue.message}`
      );
      throw new SchemaValidationError(this.name, "unknown", errors);
    }

    return result.data;
  }

  /**
   * Truncate text to fit within token limit.
   *
   * @param text - Text to truncate
   * @param maxChars - Maximum characters (conservative token estimate)
   * @returns Truncated text
   */
  protected truncateText(text: string, maxChars: number): string {
    if (text.length <= maxChars) {
      return text;
    }
    return text.slice(0, maxChars - 20) + "\n[...truncated]";
  }

  /**
   * Sleep for specified milliseconds.
   * @deprecated Use `sleep` from "../utils" instead
   */
  protected sleep(ms: number): Promise<void> {
    return sleep(ms);
  }
}
