/**
 * Prompt Test Route
 *
 * Demonstrates prompt management and A/B testing integration.
 * Fetches prompts from CognObserve platform, compiles them, and
 * runs mock LLM calls with proper tracing.
 *
 * Endpoints:
 * - POST /prompt-test/single     - Fetch prompt, compile, mock LLM call
 * - POST /prompt-test/experiment - Resolve A/B experiment, compile, mock LLM call
 */
import { Router, type Request, type Response, type IRouter } from "express";
import { trace, SpanStatusCode, context } from "@opentelemetry/api";
import { z } from "zod";
import { CognObserve } from "@cognobserve/sdk";
import { config } from "../config/env.js";

const router: IRouter = Router();
const tracer = trace.getTracer("demo-prompt-test");

// ============================================================
// Types & Schemas
// ============================================================

const SinglePromptRequestSchema = z.object({
  promptSlug: z.string().min(1),
  label: z.enum(["production", "staging", "latest"]).optional(),
  version: z.number().int().positive().optional(),
  variables: z.record(z.string(), z.string()).optional().default({}),
  mockModel: z.string().optional().default("gpt-4-mock"),
});

const ExperimentRequestSchema = z.object({
  experimentSlug: z.string().min(1),
  assignmentKey: z.string().min(1),
  forceVariant: z.enum(["A", "B"]).optional(),
  variables: z.record(z.string(), z.string()).optional().default({}),
  mockModel: z.string().optional().default("gpt-4-mock"),
});

// ============================================================
// Mock LLM Response Generation
// ============================================================

const MOCK_RESPONSES = [
  "Based on my analysis, this is a compelling perspective that warrants deeper exploration.",
  "The key factors here involve understanding the underlying principles and their implications.",
  "That's an excellent prompt! Let me provide a comprehensive response with multiple insights.",
  "I can offer several valuable observations based on the given context and requirements.",
  "This is a nuanced topic that benefits from examining multiple angles and perspectives.",
];

const countTokens = (text: string): number => Math.ceil(text.length / 4);

const simulateLatency = async (tokens: number): Promise<void> => {
  const baseLatency = 100;
  const perTokenLatency = 5;
  const jitter = Math.random() * 50;
  const delay = baseLatency + tokens * perTokenLatency + jitter;
  await new Promise((resolve) => setTimeout(resolve, delay));
};

const getMockResponse = (): string => {
  return MOCK_RESPONSES[Math.floor(Math.random() * MOCK_RESPONSES.length)] ?? MOCK_RESPONSES[0]!;
};

// ============================================================
// SDK Client Initialization
// ============================================================

let sdkInitialized = false;

const ensureSDKInitialized = () => {
  if (!sdkInitialized) {
    if (!config.cognobserve.apiKey) {
      throw new Error("COGNOBSERVE_API_KEY is required for prompt testing");
    }
    CognObserve.init({
      apiKey: config.cognobserve.apiKey,
      endpoint: config.cognobserve.endpoint,
      debug: config.server.isDev,
    });
    sdkInitialized = true;
  }
};

// ============================================================
// Routes
// ============================================================

/**
 * POST /prompt-test/single
 *
 * Fetch a single prompt, compile it with variables, and run a mock LLM call.
 * Traces include prompt metadata for platform analytics.
 */
router.post("/prompt-test/single", async (req: Request, res: Response) => {
  // Validate request
  const parsed = SinglePromptRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: "INVALID_REQUEST",
      details: parsed.error.flatten(),
    });
    return;
  }

  const { promptSlug, label, version, variables, mockModel } = parsed.data;
  const startTime = Date.now();

  // Start parent span for the prompt test
  const parentSpan = tracer.startSpan(
    "prompt-test.single",
    undefined,
    context.active()
  );

  try {
    ensureSDKInitialized();

    // Fetch prompt from platform
    parentSpan.addEvent("fetching_prompt", { slug: promptSlug });
    const prompt = await CognObserve.prompts.get(promptSlug, {
      label,
      version,
      cache: true,
    });

    // Add prompt metadata to span
    parentSpan.setAttribute("cognobserve.prompt_version_id", prompt.id);
    parentSpan.setAttribute("cognobserve.prompt_slug", prompt.slug);
    parentSpan.setAttribute("cognobserve.prompt_version", prompt.version);
    parentSpan.setAttribute("cognobserve.prompt_type", prompt.type);
    parentSpan.setAttribute("cognobserve.prompt_name", prompt.name);

    // Compile prompt with variables
    parentSpan.addEvent("compiling_prompt");
    const compiled = prompt.compile(variables);

    // Extract compiled content for display and token counting
    let compiledContent: string;
    if (compiled.type === "text") {
      compiledContent = compiled.text;
    } else {
      compiledContent = compiled.messages.map((m: { role: string; content: string }) => `${m.role}: ${m.content}`).join("\n");
    }

    // Create child span for mock LLM call
    const llmSpan = tracer.startSpan(
      "llm.generate",
      undefined,
      trace.setSpan(context.active(), parentSpan)
    );

    llmSpan.setAttribute("llm.model.name", mockModel);
    llmSpan.setAttribute("llm.model.provider", "mock");

    // Simulate LLM call
    const inputTokens = countTokens(compiledContent);
    const mockResponse = getMockResponse();
    const outputTokens = countTokens(mockResponse);

    await simulateLatency(outputTokens);

    // Set token usage on LLM span
    llmSpan.setAttribute("gen_ai.usage.prompt_tokens", inputTokens);
    llmSpan.setAttribute("gen_ai.usage.completion_tokens", outputTokens);
    llmSpan.setAttribute("gen_ai.usage.total_tokens", inputTokens + outputTokens);
    llmSpan.setAttribute("llm.usage.prompt_tokens", inputTokens);
    llmSpan.setAttribute("llm.usage.completion_tokens", outputTokens);
    llmSpan.setAttribute("llm.usage.total_tokens", inputTokens + outputTokens);

    llmSpan.setStatus({ code: SpanStatusCode.OK });
    llmSpan.end();

    const duration = Date.now() - startTime;
    parentSpan.setAttribute("llm.latency_ms", duration);
    parentSpan.setStatus({ code: SpanStatusCode.OK });

    res.json({
      success: true,
      traceId: parentSpan.spanContext().traceId,
      spanId: parentSpan.spanContext().spanId,
      prompt: {
        name: prompt.name,
        slug: prompt.slug,
        version: prompt.version,
        type: prompt.type,
      },
      llm: {
        model: mockModel,
        compiledPrompt: compiled.type === "text" ? compiled.text : compiled.messages,
        response: mockResponse,
        usage: {
          promptTokens: inputTokens,
          completionTokens: outputTokens,
          totalTokens: inputTokens + outputTokens,
        },
        latencyMs: duration,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
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

/**
 * POST /prompt-test/experiment
 *
 * Resolve an A/B experiment to get assigned variant and prompt.
 * Runs a mock LLM call with the variant's prompt and includes
 * experiment metadata in the trace for analysis.
 */
router.post("/prompt-test/experiment", async (req: Request, res: Response) => {
  // Validate request
  const parsed = ExperimentRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: "INVALID_REQUEST",
      details: parsed.error.flatten(),
    });
    return;
  }

  const { experimentSlug, assignmentKey, forceVariant, variables, mockModel } = parsed.data;
  const startTime = Date.now();

  // Start parent span for the experiment test
  const parentSpan = tracer.startSpan(
    "prompt-test.experiment",
    undefined,
    context.active()
  );

  try {
    ensureSDKInitialized();

    // Resolve experiment assignment
    parentSpan.addEvent("resolving_experiment", { slug: experimentSlug });
    const assignment = await CognObserve.prompts.getExperiment(experimentSlug, {
      assignmentKey,
      forceVariant,
      cache: true,
    });

    const { experiment, variant, inAllocation, prompt, traceMetadata } = assignment;

    // Add experiment metadata to span (critical for A/B analysis)
    parentSpan.setAttribute("cognobserve.prompt_experiment_id", traceMetadata.promptExperimentId);
    parentSpan.setAttribute("cognobserve.prompt_experiment_slug", traceMetadata.promptExperimentSlug);
    parentSpan.setAttribute("cognobserve.prompt_variant_id", traceMetadata.promptVariantId);
    parentSpan.setAttribute("cognobserve.prompt_variant_name", traceMetadata.promptVariantName);
    parentSpan.setAttribute("cognobserve.assignment_key_hash", traceMetadata.assignmentKeyHash);
    parentSpan.setAttribute("cognobserve.in_allocation", inAllocation);

    // Add prompt metadata
    parentSpan.setAttribute("cognobserve.prompt_version_id", prompt.id);
    parentSpan.setAttribute("cognobserve.prompt_slug", prompt.slug);
    parentSpan.setAttribute("cognobserve.prompt_version", prompt.version);
    parentSpan.setAttribute("cognobserve.prompt_type", prompt.type);
    parentSpan.setAttribute("cognobserve.prompt_name", prompt.name);

    // Compile prompt with variables
    parentSpan.addEvent("compiling_prompt");
    const compiled = prompt.compile(variables);

    // Extract compiled content for display and token counting
    let compiledContent: string;
    if (compiled.type === "text") {
      compiledContent = compiled.text;
    } else {
      compiledContent = compiled.messages.map((m: { role: string; content: string }) => `${m.role}: ${m.content}`).join("\n");
    }

    // Create child span for mock LLM call
    const llmSpan = tracer.startSpan(
      "llm.generate",
      undefined,
      trace.setSpan(context.active(), parentSpan)
    );

    llmSpan.setAttribute("llm.model.name", mockModel);
    llmSpan.setAttribute("llm.model.provider", "mock");

    // Also add variant ID to the LLM span for direct correlation
    llmSpan.setAttribute("cognobserve.prompt_variant_id", traceMetadata.promptVariantId);

    // Simulate LLM call
    const inputTokens = countTokens(compiledContent);
    const mockResponse = getMockResponse();
    const outputTokens = countTokens(mockResponse);

    await simulateLatency(outputTokens);

    // Set token usage on LLM span
    llmSpan.setAttribute("gen_ai.usage.prompt_tokens", inputTokens);
    llmSpan.setAttribute("gen_ai.usage.completion_tokens", outputTokens);
    llmSpan.setAttribute("gen_ai.usage.total_tokens", inputTokens + outputTokens);
    llmSpan.setAttribute("llm.usage.prompt_tokens", inputTokens);
    llmSpan.setAttribute("llm.usage.completion_tokens", outputTokens);
    llmSpan.setAttribute("llm.usage.total_tokens", inputTokens + outputTokens);

    llmSpan.setStatus({ code: SpanStatusCode.OK });
    llmSpan.end();

    const duration = Date.now() - startTime;
    parentSpan.setAttribute("llm.latency_ms", duration);
    parentSpan.setStatus({ code: SpanStatusCode.OK });

    res.json({
      success: true,
      traceId: parentSpan.spanContext().traceId,
      spanId: parentSpan.spanContext().spanId,
      prompt: {
        name: prompt.name,
        slug: prompt.slug,
        version: prompt.version,
        type: prompt.type,
      },
      experiment: {
        id: experiment.id,
        slug: experiment.slug,
        name: experiment.name,
        variant: variant.name,
        isControl: variant.isControl,
        inAllocation,
      },
      llm: {
        model: mockModel,
        compiledPrompt: compiled.type === "text" ? compiled.text : compiled.messages,
        response: mockResponse,
        usage: {
          promptTokens: inputTokens,
          completionTokens: outputTokens,
          totalTokens: inputTokens + outputTokens,
        },
        latencyMs: duration,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
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

export { router as promptTestRouter };
