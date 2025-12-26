import { Ducsigr } from '../ducsigr';
import { getActiveTrace } from '../context';
import type { Trace } from '../trace';
import type { Span } from '../span';
import { resolveOptions, type WrapperOptions } from './types';

// Use 'any' for Anthropic types to avoid requiring @anthropic-ai/sdk as a dependency
// The actual types come from the user's anthropic package
type AnthropicClient = {
  messages: {
    create: (params: any, options?: any) => Promise<any>;
    stream?: (params: any, options?: any) => any;
  };
};

/**
 * Wrap an Anthropic client for automatic tracing
 *
 * @example
 * ```typescript
 * import Anthropic from '@anthropic-ai/sdk';
 * import { wrapAnthropic } from '@ducsigr/sdk/integrations';
 *
 * const anthropic = wrapAnthropic(new Anthropic());
 *
 * // All calls are now automatically traced
 * const response = await anthropic.messages.create({
 *   model: 'claude-3-5-sonnet-20241022',
 *   max_tokens: 1024,
 *   messages: [{ role: 'user', content: 'Hello!' }],
 * });
 * ```
 */
export function wrapAnthropic<T extends AnthropicClient>(
  client: T,
  options: WrapperOptions = {}
): T {
  const opts = resolveOptions(options, 'anthropic');

  // Wrap messages.create
  const originalCreate = client.messages.create.bind(client.messages);

  client.messages.create = async function (
    params: any,
    requestOptions?: any
  ): Promise<any> {
    let trace: Trace | undefined = getActiveTrace();
    let shouldEndTrace = false;

    if (!trace && opts.createTrace) {
      trace = Ducsigr.startTrace({
        name: `${opts.tracePrefix}-messages`,
      });
      shouldEndTrace = true;
    }

    if (!trace) {
      return originalCreate(params, requestOptions);
    }

    const spanName = `${opts.tracePrefix}.messages.create`;
    const span = trace.startSpan({ name: spanName });

    // Capture input
    if (opts.captureInput) {
      span.setInput({
        model: params.model,
        messages: params.messages,
        ...(params.system && { system: params.system }),
        max_tokens: params.max_tokens,
        ...(params.tools && { tools: params.tools }),
      });
    }

    span.setModel(params.model, {
      max_tokens: params.max_tokens,
      temperature: params.temperature,
      top_p: params.top_p,
      top_k: params.top_k,
    });

    try {
      // Handle streaming
      if (params.stream) {
        const stream = await originalCreate(params, requestOptions);
        return wrapAnthropicStream(stream, span, opts, shouldEndTrace ? trace : null);
      }

      // Non-streaming
      const response = await originalCreate(params, requestOptions);

      // Capture output
      if (opts.captureOutput) {
        span.setOutput({
          id: response.id,
          content: response.content,
          stop_reason: response.stop_reason,
          model: response.model,
        });
      }

      // Capture usage
      if (response.usage) {
        span.setUsage({
          promptTokens: response.usage.input_tokens,
          completionTokens: response.usage.output_tokens,
          totalTokens: response.usage.input_tokens + response.usage.output_tokens,
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

  // Wrap messages.stream if it exists (convenience method in newer SDK versions)
  if (client.messages.stream) {
    const originalStream = client.messages.stream.bind(client.messages);

    client.messages.stream = function (params: any, requestOptions?: any): any {
      const messageStream = originalStream(params, requestOptions);

      let trace: Trace | undefined = getActiveTrace();
      let shouldEndTrace = false;

      if (!trace && opts.createTrace) {
        trace = Ducsigr.startTrace({
          name: `${opts.tracePrefix}-messages-stream`,
        });
        shouldEndTrace = true;
      }

      if (!trace) {
        return messageStream;
      }

      const span = trace.startSpan({
        name: `${opts.tracePrefix}.messages.stream`,
      });

      if (opts.captureInput) {
        span.setInput({
          model: params.model,
          messages: params.messages,
          ...(params.system && { system: params.system }),
          max_tokens: params.max_tokens,
        });
      }

      span.setModel(params.model);

      // Hook into the finalMessage promise
      const traceCopy = trace;
      messageStream.finalMessage().then(
        (message: any) => {
          if (opts.captureOutput) {
            span.setOutput({
              id: message.id,
              content: message.content,
              stop_reason: message.stop_reason,
            });
          }

          if (message.usage) {
            span.setUsage({
              promptTokens: message.usage.input_tokens,
              completionTokens: message.usage.output_tokens,
              totalTokens:
                message.usage.input_tokens + message.usage.output_tokens,
            });
          }

          span.end();

          if (shouldEndTrace && traceCopy) {
            traceCopy.end();
          }
        },
        (error: Error) => {
          span.setError(error.message);
          span.end();

          if (shouldEndTrace && traceCopy) {
            traceCopy.end();
          }
        }
      );

      return messageStream;
    };
  }

  return client;
}

/**
 * Wrap Anthropic streaming response
 */
function wrapAnthropicStream(
  stream: AsyncIterable<any>,
  span: Span,
  opts: ReturnType<typeof resolveOptions>,
  trace: Trace | null
): AsyncIterable<any> {
  let inputTokens = 0;
  let outputTokens = 0;
  const contentBlocks: string[] = [];
  let stopReason: string | null = null;

  const wrappedStream = {
    [Symbol.asyncIterator]: async function* () {
      try {
        for await (const event of stream) {
          // Track usage from message_start
          if (event.type === 'message_start' && event.message?.usage) {
            inputTokens = event.message.usage.input_tokens;
          }

          // Track content
          if (event.type === 'content_block_delta') {
            if (event.delta?.type === 'text_delta' && event.delta?.text) {
              contentBlocks.push(event.delta.text);
            }
          }

          // Track final usage from message_delta
          if (event.type === 'message_delta') {
            if (event.usage) {
              outputTokens = event.usage.output_tokens;
            }
            if (event.delta?.stop_reason) {
              stopReason = event.delta.stop_reason;
            }
          }

          yield event;
        }

        if (opts.captureOutput) {
          span.setOutput({
            content: contentBlocks.join(''),
            stop_reason: stopReason,
          });
        }

        span.setUsage({
          promptTokens: inputTokens,
          completionTokens: outputTokens,
          totalTokens: inputTokens + outputTokens,
        });

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
