/**
 * Mock LLM Route
 *
 * Simulates an LLM API call with token usage tracking.
 * Demonstrates parent-child span hierarchy and LLM semantic conventions.
 *
 * This route creates a trace structure similar to real LLM calls:
 * - llm.generate (parent)
 *   - llm.tokenize (child)
 *   - llm.infer (child)
 *   - llm.detokenize (child)
 */
import { Router, type Request, type Response, type IRouter } from "express";
import { trace, SpanStatusCode, context } from "@opentelemetry/api";

const router: IRouter = Router();
const tracer = trace.getTracer("demo-llm");

interface LLMRequest {
  prompt?: string;
  model?: string;
  maxTokens?: number;
}

// Mock responses for variety
const MOCK_RESPONSES = [
  "The answer to your question involves understanding the fundamental principles at play. Let me explain in detail...",
  "Based on my analysis, I can provide several insights that may help address your query. First, consider that...",
  "That's an interesting question! The key factors to consider are the underlying patterns and their implications.",
  "I'd be happy to help with that. The most important aspect here is recognizing the relationship between...",
  "Great question! Let me break this down into manageable parts to give you a comprehensive answer.",
];

// Simulate token counting (roughly 4 chars per token)
const countTokens = (text: string): number => Math.ceil(text.length / 4);

// Simulate latency based on token count
const simulateLatency = async (tokens: number): Promise<void> => {
  const baseLatency = 100; // 100ms base
  const perTokenLatency = 5; // 5ms per token
  const jitter = Math.random() * 50; // 0-50ms jitter
  const delay = baseLatency + tokens * perTokenLatency + jitter;
  await new Promise((resolve) => setTimeout(resolve, delay));
};

router.post("/llm", async (req: Request, res: Response) => {
  const {
    prompt = "Tell me something interesting",
    model = "gpt-4-mock",
    maxTokens = 100,
  } = req.body as LLMRequest;

  const startTime = Date.now();

  // Start parent span for the full LLM generation
  const parentSpan = tracer.startSpan(
    "llm.generate",
    undefined,
    context.active()
  );

  try {
    // Set model attributes on parent span
    parentSpan.setAttribute("llm.model.name", model);
    parentSpan.setAttribute("llm.model.provider", "mock");
    parentSpan.setAttribute("llm.request.max_tokens", maxTokens);

    // Child span 1: Tokenization
    const tokenizeSpan = tracer.startSpan(
      "llm.tokenize",
      undefined,
      trace.setSpan(context.active(), parentSpan)
    );

    const inputTokens = countTokens(prompt);
    tokenizeSpan.setAttribute("llm.tokenize.input_length", prompt.length);
    tokenizeSpan.setAttribute("llm.tokenize.token_count", inputTokens);
    await simulateLatency(inputTokens / 10); // Fast tokenization

    tokenizeSpan.setStatus({ code: SpanStatusCode.OK });
    tokenizeSpan.end();

    // Child span 2: Model inference (the "thinking" part)
    const inferSpan = tracer.startSpan(
      "llm.infer",
      undefined,
      trace.setSpan(context.active(), parentSpan)
    );

    // Pick a random mock response
    const mockResponse =
      MOCK_RESPONSES[Math.floor(Math.random() * MOCK_RESPONSES.length)] ??
      "I can help you with that question.";
    const outputTokens = Math.min(countTokens(mockResponse), maxTokens);

    inferSpan.setAttribute("llm.infer.model", model);
    inferSpan.setAttribute("llm.infer.output_tokens", outputTokens);
    await simulateLatency(outputTokens); // Main latency

    inferSpan.setStatus({ code: SpanStatusCode.OK });
    inferSpan.end();

    // Child span 3: Detokenization
    const detokenizeSpan = tracer.startSpan(
      "llm.detokenize",
      undefined,
      trace.setSpan(context.active(), parentSpan)
    );

    detokenizeSpan.setAttribute("llm.detokenize.token_count", outputTokens);
    await simulateLatency(outputTokens / 10); // Fast detokenization

    detokenizeSpan.setStatus({ code: SpanStatusCode.OK });
    detokenizeSpan.end();

    // Calculate totals
    const totalTokens = inputTokens + outputTokens;
    const duration = Date.now() - startTime;

    // Set LLM semantic convention attributes on parent span
    // Following OpenTelemetry Gen AI semantic conventions
    parentSpan.setAttribute("gen_ai.usage.prompt_tokens", inputTokens);
    parentSpan.setAttribute("gen_ai.usage.completion_tokens", outputTokens);
    parentSpan.setAttribute("gen_ai.usage.total_tokens", totalTokens);

    // Also set llm.* attributes for broader compatibility
    parentSpan.setAttribute("llm.usage.prompt_tokens", inputTokens);
    parentSpan.setAttribute("llm.usage.completion_tokens", outputTokens);
    parentSpan.setAttribute("llm.usage.total_tokens", totalTokens);

    // Performance metrics
    parentSpan.setAttribute("llm.latency_ms", duration);
    parentSpan.setAttribute(
      "llm.tokens_per_second",
      Math.round((outputTokens / duration) * 1000)
    );

    parentSpan.setStatus({ code: SpanStatusCode.OK });

    res.json({
      success: true,
      traceId: parentSpan.spanContext().traceId,
      spanId: parentSpan.spanContext().spanId,
      data: {
        model,
        prompt: prompt.substring(0, 100) + (prompt.length > 100 ? "..." : ""),
        response: mockResponse,
        usage: {
          promptTokens: inputTokens,
          completionTokens: outputTokens,
          totalTokens,
        },
        performance: {
          latencyMs: duration,
          tokensPerSecond: Math.round((outputTokens / duration) * 1000),
        },
      },
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    parentSpan.setStatus({ code: SpanStatusCode.ERROR, message: errorMessage });
    parentSpan.recordException(error as Error);

    res.status(500).json({
      success: false,
      traceId: parentSpan.spanContext().traceId,
      error: errorMessage,
    });
  } finally {
    parentSpan.end();
  }
});

export { router as llmRouter };
