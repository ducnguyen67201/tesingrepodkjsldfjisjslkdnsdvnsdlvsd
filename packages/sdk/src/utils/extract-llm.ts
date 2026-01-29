import type { TokenUsage } from '../types';

/**
 * Extracted data from LLM response
 */
export interface ExtractedLLMData {
  model: string | null;
  modelParameters: Record<string, unknown> | null;
  usage: TokenUsage | null;
  output: Record<string, unknown> | null;
}

/**
 * Auto-extract LLM data from response objects
 * Supports: OpenAI, Anthropic, Google/Gemini, Cohere, and similar formats
 */
export function extractLLMData(response: unknown): ExtractedLLMData {
  if (!response || typeof response !== 'object') {
    return { model: null, modelParameters: null, usage: null, output: null };
  }

  const res = response as Record<string, unknown>;

  return {
    model: extractModel(res),
    modelParameters: null, // Would need request data for this
    usage: extractUsage(res),
    output: extractOutput(res),
  };
}

/**
 * Extract model name from response
 */
function extractModel(response: Record<string, unknown>): string | null {
  // OpenAI format
  if (typeof response.model === 'string') {
    return response.model;
  }

  // Anthropic format (also has model at top level)
  // Google/Gemini - model info might be in metadata
  if (
    response.modelVersion &&
    typeof response.modelVersion === 'string'
  ) {
    return response.modelVersion;
  }

  return null;
}

/**
 * Extract token usage from various LLM response formats
 */
function extractUsage(response: Record<string, unknown>): TokenUsage | null {
  // OpenAI format: { usage: { prompt_tokens, completion_tokens, total_tokens } }
  if (response.usage && typeof response.usage === 'object') {
    const usage = response.usage as Record<string, unknown>;

    // OpenAI style
    if ('prompt_tokens' in usage) {
      return {
        promptTokens: usage.prompt_tokens as number,
        completionTokens: usage.completion_tokens as number,
        totalTokens: usage.total_tokens as number,
      };
    }

    // Anthropic style: { input_tokens, output_tokens }
    if ('input_tokens' in usage) {
      const inputTokens = usage.input_tokens as number;
      const outputTokens = usage.output_tokens as number;
      return {
        promptTokens: inputTokens,
        completionTokens: outputTokens,
        totalTokens: inputTokens + outputTokens,
      };
    }
  }

  // Google/Gemini format: { usageMetadata: { promptTokenCount, candidatesTokenCount, totalTokenCount } }
  if (response.usageMetadata && typeof response.usageMetadata === 'object') {
    const usage = response.usageMetadata as Record<string, unknown>;
    if ('promptTokenCount' in usage) {
      return {
        promptTokens: usage.promptTokenCount as number,
        completionTokens: usage.candidatesTokenCount as number,
        totalTokens: usage.totalTokenCount as number,
      };
    }
  }

  // Cohere format: { meta: { tokens: { input_tokens, output_tokens } } }
  if (response.meta && typeof response.meta === 'object') {
    const meta = response.meta as Record<string, unknown>;
    if (meta.tokens && typeof meta.tokens === 'object') {
      const tokens = meta.tokens as Record<string, unknown>;
      if ('input_tokens' in tokens) {
        const inputTokens = tokens.input_tokens as number;
        const outputTokens = tokens.output_tokens as number;
        return {
          promptTokens: inputTokens,
          completionTokens: outputTokens,
          totalTokens: inputTokens + outputTokens,
        };
      }
    }
  }

  // Mistral format (similar to OpenAI)
  // Already handled by OpenAI format above

  return null;
}

/**
 * Extract relevant output from LLM response
 */
function extractOutput(response: Record<string, unknown>): Record<string, unknown> | null {
  // OpenAI chat completion format
  if (Array.isArray(response.choices) && response.choices.length > 0) {
    const firstChoice = response.choices[0] as Record<string, unknown>;
    return {
      id: response.id,
      finish_reason: firstChoice.finish_reason,
      message: firstChoice.message,
    };
  }

  // Anthropic format
  if (Array.isArray(response.content) && response.content.length > 0) {
    return {
      id: response.id,
      stop_reason: response.stop_reason,
      content: response.content,
    };
  }

  // Google/Gemini format
  if (Array.isArray(response.candidates) && response.candidates.length > 0) {
    const firstCandidate = response.candidates[0] as Record<string, unknown>;
    return {
      content: firstCandidate.content,
      finishReason: firstCandidate.finishReason,
    };
  }

  // Cohere format
  if (response.text && typeof response.text === 'string') {
    return {
      text: response.text,
      generation_id: response.generation_id,
    };
  }

  // If we can't extract specific format, return a sanitized version
  // Avoid returning huge objects
  const safeKeys = ['id', 'object', 'created', 'model'];
  const output: Record<string, unknown> = {};
  for (const key of safeKeys) {
    if (key in response) {
      output[key] = response[key];
    }
  }

  return Object.keys(output).length > 0 ? output : null;
}
