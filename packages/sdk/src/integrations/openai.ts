import { Ducsigr } from '../ducsigr';
import { getActiveTrace } from '../context';
import type { Trace } from '../trace';
import type { Span } from '../span';
import { resolveOptions, type WrapperOptions } from './types';

// Use 'any' for OpenAI types to avoid requiring openai as a dependency
// The actual types come from the user's openai package
type OpenAIClient = {
  chat: {
    completions: {
      create: (params: any, options?: any) => Promise<any>;
    };
  };
  embeddings: {
    create: (params: any, options?: any) => Promise<any>;
  };
};

/**
 * Wrap an OpenAI client for automatic tracing
 *
 * @example
 * ```typescript
 * import OpenAI from 'openai';
 * import { wrapOpenAI } from '@ducsigr/sdk/integrations';
 *
 * const openai = wrapOpenAI(new OpenAI());
 *
 * // All calls are now automatically traced
 * const response = await openai.chat.completions.create({
 *   model: 'gpt-4',
 *   messages: [{ role: 'user', content: 'Hello!' }],
 * });
 * ```
 */
export function wrapOpenAI<T extends OpenAIClient>(
  client: T,
  options: WrapperOptions = {}
): T {
  const opts = resolveOptions(options, 'openai');

  // Wrap chat.completions.create
  const originalChatCreate = client.chat.completions.create.bind(
    client.chat.completions
  );

  client.chat.completions.create = async function (
    params: any,
    requestOptions?: any
  ): Promise<any> {
    // Get or create trace
    let trace: Trace | undefined = getActiveTrace();
    let shouldEndTrace = false;

    if (!trace && opts.createTrace) {
      trace = Ducsigr.startTrace({
        name: `${opts.tracePrefix}-chat`,
      });
      shouldEndTrace = true;
    }

    // If no trace context and not creating, just call original
    if (!trace) {
      return originalChatCreate(params, requestOptions);
    }

    const spanName = `${opts.tracePrefix}.chat.completions.create`;
    const span = trace.startSpan({ name: spanName });

    // Capture input
    if (opts.captureInput) {
      span.setInput({
        model: params.model,
        messages: params.messages,
        ...(params.temperature !== undefined && {
          temperature: params.temperature,
        }),
        ...(params.max_tokens !== undefined && {
          max_tokens: params.max_tokens,
        }),
        ...(params.tools && { tools: params.tools }),
        ...(params.functions && { functions: params.functions }),
      });
    }

    span.setModel(params.model, {
      temperature: params.temperature,
      max_tokens: params.max_tokens,
      top_p: params.top_p,
      frequency_penalty: params.frequency_penalty,
      presence_penalty: params.presence_penalty,
    });

    try {
      // Handle streaming
      if (params.stream) {
        const stream = await originalChatCreate(params, requestOptions);
        return wrapOpenAIStream(stream, span, opts, shouldEndTrace ? trace : null);
      }

      // Non-streaming
      const response = await originalChatCreate(params, requestOptions);

      // Capture output
      if (opts.captureOutput && response.choices) {
        span.setOutput({
          id: response.id,
          choices: response.choices,
          finish_reason: response.choices[0]?.finish_reason,
        });
      }

      // Capture usage
      if (response.usage) {
        span.setUsage({
          promptTokens: response.usage.prompt_tokens,
          completionTokens: response.usage.completion_tokens,
          totalTokens: response.usage.total_tokens,
        });
      }

      span.end();

      if (shouldEndTrace && trace) {
        trace.end();
      }

      return response;
    } catch (error) {
      span.setError(error instanceof Error ? error.message : String(error));
      span.end();

      if (shouldEndTrace && trace) {
        trace.end();
      }

      throw error;
    }
  };

  // Wrap embeddings.create
  const originalEmbeddingsCreate = client.embeddings.create.bind(
    client.embeddings
  );

  client.embeddings.create = async function (
    params: any,
    requestOptions?: any
  ): Promise<any> {
    let trace: Trace | undefined = getActiveTrace();
    let shouldEndTrace = false;

    if (!trace && opts.createTrace) {
      trace = Ducsigr.startTrace({
        name: `${opts.tracePrefix}-embedding`,
      });
      shouldEndTrace = true;
    }

    if (!trace) {
      return originalEmbeddingsCreate(params, requestOptions);
    }

    const span = trace.startSpan({
      name: `${opts.tracePrefix}.embeddings.create`,
    });

    span.setModel(params.model);

    if (opts.captureInput) {
      span.setInput({
        model: params.model,
        input:
          typeof params.input === 'string'
            ? params.input.slice(0, 1000) // Truncate long inputs
            : `[${Array.isArray(params.input) ? params.input.length : 1} items]`,
      });
    }

    try {
      const response = await originalEmbeddingsCreate(params, requestOptions);

      if (response.usage) {
        span.setUsage({
          promptTokens: response.usage.prompt_tokens,
          totalTokens: response.usage.total_tokens,
        });
      }

      if (opts.captureOutput && response.data) {
        span.setOutput({
          embedding_count: response.data.length,
          dimensions: response.data[0]?.embedding?.length,
        });
      }

      span.end();

      if (shouldEndTrace && trace) {
        trace.end();
      }

      return response;
    } catch (error) {
      span.setError(error instanceof Error ? error.message : String(error));
      span.end();

      if (shouldEndTrace && trace) {
        trace.end();
      }

      throw error;
    }
  };

  return client;
}

/**
 * Wrap an OpenAI streaming response to capture usage and content
 */
function wrapOpenAIStream(
  stream: AsyncIterable<any>,
  span: Span,
  opts: ReturnType<typeof resolveOptions>,
  trace: Trace | null
): AsyncIterable<any> {
  const chunks: any[] = [];
  let promptTokens = 0;
  let completionTokens = 0;

  const wrappedStream = {
    [Symbol.asyncIterator]: async function* () {
      try {
        for await (const chunk of stream) {
          chunks.push(chunk);

          // Accumulate usage if present (OpenAI includes usage in final chunk with stream_options)
          if (chunk.usage) {
            promptTokens = chunk.usage.prompt_tokens ?? promptTokens;
            completionTokens = chunk.usage.completion_tokens ?? completionTokens;
          }

          yield chunk;
        }

        // Reconstruct final message from chunks
        const finalContent = chunks
          .map((c) => c.choices?.[0]?.delta?.content ?? '')
          .join('');

        const finishReason =
          chunks[chunks.length - 1]?.choices?.[0]?.finish_reason;

        if (opts.captureOutput) {
          span.setOutput({
            content: finalContent,
            finish_reason: finishReason,
            chunk_count: chunks.length,
          });
        }

        // Set usage if captured
        if (promptTokens > 0 || completionTokens > 0) {
          span.setUsage({
            promptTokens,
            completionTokens,
            totalTokens: promptTokens + completionTokens,
          });
        }

        span.end();

        if (trace) {
          trace.end();
        }
      } catch (error) {
        span.setError(error instanceof Error ? error.message : String(error));
        span.end();

        if (trace) {
          trace.end();
        }

        throw error;
      }
    },
  };

  return wrappedStream;
}
