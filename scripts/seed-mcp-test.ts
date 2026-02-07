/**
 * Seed script for MCP testing
 *
 * Seeds traces, spans, and logs into the "Test B" project
 * so the MCP server has data to query.
 *
 * Run: pnpm tsx scripts/seed-mcp-test.ts
 */

import crypto from "crypto";

const PROJECT_ID = "cmjm0xjvn000022m18n2ibn03";
const NUM_TRACES = 50;

const MODELS = ["gpt-4o", "gpt-4o-mini", "claude-3-5-sonnet", "claude-3-haiku", "gpt-3.5-turbo"];
const PROVIDERS: Record<string, string> = {
  "gpt-4o": "openai",
  "gpt-4o-mini": "openai",
  "gpt-3.5-turbo": "openai",
  "claude-3-5-sonnet": "anthropic",
  "claude-3-haiku": "anthropic",
};

const SPAN_NAMES = [
  "chat gpt-4o",
  "chat claude-3-5-sonnet",
  "POST /api/chat",
  "SELECT users",
  "embedding.create",
  "retrieval.vector_search",
  "agent.plan",
  "tool.web_search",
];

const ROOT_SPAN_NAMES = [
  "POST /api/chat/completions",
  "POST /api/assistant/query",
  "POST /api/embeddings",
  "GET /api/search",
  "POST /api/agent/run",
  "POST /api/summarize",
];

const ERROR_MESSAGES = [
  "Rate limit exceeded - 429",
  "Context length exceeded",
  "Invalid API key",
  "Connection timeout after 30s",
  "Model overloaded, please retry",
];

const SERVICE_NAMES = ["ai-assistant", "chat-api", "embedding-service"];

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function hexId(bytes: number): string {
  return crypto.randomBytes(bytes).toString("hex");
}

async function main() {
  console.log("Seeding MCP test data...\n");

  const { prisma } = await import("../packages/db/src/index.js");

  // Verify project exists
  const project = await prisma.project.findUnique({ where: { id: PROJECT_ID } });
  if (!project) {
    console.error(`Project ${PROJECT_ID} not found!`);
    process.exit(1);
  }
  console.log(`Target project: ${project.name} (${project.id})\n`);

  // Clean existing data
  const existingTraces = await prisma.trace.count({ where: { projectId: PROJECT_ID } });
  if (existingTraces > 0) {
    console.log(`Cleaning ${existingTraces} existing traces...`);
    await prisma.span.deleteMany({ where: { trace: { projectId: PROJECT_ID } } });
    await prisma.trace.deleteMany({ where: { projectId: PROJECT_ID } });
    await prisma.logRecord.deleteMany({ where: { projectId: PROJECT_ID } });
  }

  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  let totalSpans = 0;
  let errorTraces = 0;

  console.log(`Creating ${NUM_TRACES} traces...\n`);

  for (let i = 0; i < NUM_TRACES; i++) {
    const externalTraceId = hexId(16); // 32-char hex
    const rootSpanExternalId = hexId(8); // 16-char hex
    const serviceName = randomChoice(SERVICE_NAMES);
    const rootSpanName = randomChoice(ROOT_SPAN_NAMES);

    // Spread over last 5 days, weighted toward recent
    const hoursAgo = Math.pow(Math.random(), 2) * 120; // 0-5 days, quadratic bias toward recent
    const traceStart = new Date(now - hoursAgo * 60 * 60 * 1000);

    // 12% error rate
    const hasError = Math.random() < 0.12;
    // 15% slow traces
    const isSlow = Math.random() < 0.15;
    if (hasError) errorTraces++;

    const baseDurationMs = isSlow ? randomInt(3000, 12000) : randomInt(150, 1500);
    const traceEnd = new Date(traceStart.getTime() + baseDurationMs);

    // Decide number of child spans (2-5)
    const numChildSpans = randomInt(2, 5);
    const spanCount = 1 + numChildSpans; // root + children

    // Determine span types present
    const spanTypes: string[] = ["LLM"];
    if (Math.random() > 0.5) spanTypes.push("HTTP");
    if (Math.random() > 0.7) spanTypes.push("DB");

    // Create trace
    const trace = await prisma.trace.create({
      data: {
        projectId: PROJECT_ID,
        externalTraceId,
        serviceName,
        serviceVersion: "1.2." + randomInt(0, 9),
        environment: randomChoice(["production", "staging"]),
        resource: {
          "service.name": serviceName,
          "service.version": "1.2." + randomInt(0, 9),
          "deployment.environment": "production",
        },
        startTime: traceStart,
        endTime: traceEnd,
        durationMs: baseDurationMs,
        spanCount,
        errorCount: hasError ? 1 : 0,
        rootSpanId: rootSpanExternalId,
        rootSpanName,
        rootSpanKind: "SERVER",
        rootSpanStatusCode: hasError ? "ERROR" : "OK",
        rootSpanDurationMs: baseDurationMs,
        hasError,
        hasException: hasError && Math.random() > 0.5,
        spanTypes,
        searchText: `${rootSpanName} ${serviceName} ${hasError ? "error" : ""}`.trim(),
      },
    });

    // Create root span
    await prisma.span.create({
      data: {
        traceId: trace.id,
        externalSpanId: rootSpanExternalId,
        name: rootSpanName,
        kind: "SERVER",
        statusCode: hasError ? "ERROR" : "OK",
        statusMessage: hasError ? randomChoice(ERROR_MESSAGES) : undefined,
        startTime: traceStart,
        endTime: traceEnd,
        durationMs: baseDurationMs,
        attributes: {
          "http.method": "POST",
          "http.route": rootSpanName.split(" ")[1],
          "http.status_code": hasError ? 500 : 200,
        },
        httpMethod: "POST",
        httpRoute: rootSpanName.split(" ")[1],
        httpStatusCode: hasError ? 500 : 200,
        spanType: "HTTP",
        searchText: rootSpanName,
      },
    });
    totalSpans++;

    // Create child spans
    let childStart = traceStart.getTime() + randomInt(5, 20);
    for (let j = 0; j < numChildSpans; j++) {
      const childExternalId = hexId(8);
      const isLlmSpan = j === 0 || Math.random() > 0.4;
      const model = isLlmSpan ? randomChoice(MODELS) : undefined;
      const childDuration = randomInt(50, Math.floor(baseDurationMs / numChildSpans));
      const childEnd = childStart + childDuration;

      const isErrorSpan = hasError && j === numChildSpans - 1;

      const promptTokens = isLlmSpan ? randomInt(100, 2000) : undefined;
      const completionTokens = isLlmSpan ? randomInt(50, 1500) : undefined;
      const totalTokens = promptTokens && completionTokens ? promptTokens + completionTokens : undefined;

      // Calculate cost
      let inputCost: number | undefined;
      let outputCost: number | undefined;
      let totalCost: number | undefined;
      if (isLlmSpan && promptTokens && completionTokens) {
        const rates: Record<string, [number, number]> = {
          "gpt-4o": [0.005, 0.015],
          "gpt-4o-mini": [0.00015, 0.0006],
          "gpt-3.5-turbo": [0.0005, 0.0015],
          "claude-3-5-sonnet": [0.003, 0.015],
          "claude-3-haiku": [0.00025, 0.00125],
        };
        const [inRate, outRate] = rates[model!] ?? [0.001, 0.002];
        inputCost = (promptTokens / 1000) * inRate;
        outputCost = (completionTokens / 1000) * outRate;
        totalCost = inputCost + outputCost;
      }

      const spanName = isLlmSpan ? `chat ${model}` : randomChoice(SPAN_NAMES.slice(2));

      await prisma.span.create({
        data: {
          traceId: trace.id,
          externalSpanId: childExternalId,
          parentSpanId: rootSpanExternalId,
          name: spanName,
          kind: isLlmSpan ? "CLIENT" : "INTERNAL",
          statusCode: isErrorSpan ? "ERROR" : "OK",
          statusMessage: isErrorSpan ? randomChoice(ERROR_MESSAGES) : undefined,
          startTime: new Date(childStart),
          endTime: new Date(childEnd),
          durationMs: childDuration,
          attributes: isLlmSpan
            ? {
                "gen_ai.request.model": model,
                "gen_ai.provider.name": PROVIDERS[model!],
                "gen_ai.operation.name": "chat",
                "gen_ai.usage.prompt_tokens": promptTokens,
                "gen_ai.usage.completion_tokens": completionTokens,
              }
            : { "custom.operation": spanName },
          model,
          promptTokens,
          completionTokens,
          totalTokens,
          inputCost,
          outputCost,
          totalCost,
          spanType: isLlmSpan ? "LLM" : j % 2 === 0 ? "HTTP" : "FUNCTION",
          genAiOperation: isLlmSpan ? "chat" : undefined,
          genAiProvider: model ? PROVIDERS[model] : undefined,
          input: isLlmSpan
            ? { messages: [{ role: "user", content: "What is the weather today?" }] }
            : undefined,
          output: isLlmSpan
            ? isErrorSpan
              ? { error: randomChoice(ERROR_MESSAGES) }
              : { message: { role: "assistant", content: "The weather today is sunny with a high of 72F." } }
            : undefined,
          exceptionType: isErrorSpan ? "APIError" : undefined,
          exceptionMessage: isErrorSpan ? randomChoice(ERROR_MESSAGES) : undefined,
          searchText: spanName,
        },
      });
      totalSpans++;

      childStart = childEnd + randomInt(5, 30);
    }

    if ((i + 1) % 10 === 0) {
      console.log(`  Created ${i + 1}/${NUM_TRACES} traces (${totalSpans} spans)`);
    }
  }

  // Create some log records too
  console.log("\nCreating log records...");
  const logCount = 30;
  for (let i = 0; i < logCount; i++) {
    const hoursAgo = Math.random() * 72;
    const timestamp = new Date(now - hoursAgo * 60 * 60 * 1000);
    const isError = Math.random() < 0.2;

    await prisma.logRecord.create({
      data: {
        projectId: PROJECT_ID,
        serviceName: randomChoice(SERVICE_NAMES),
        timestamp,
        severityNumber: isError ? 17 : 9,
        severityText: isError ? "ERROR" : "INFO",
        body: isError
          ? { stringValue: `Error: ${randomChoice(ERROR_MESSAGES)}` }
          : { stringValue: `Request processed successfully in ${randomInt(100, 2000)}ms` },
        bodyText: isError
          ? `Error: ${randomChoice(ERROR_MESSAGES)}`
          : `Request processed successfully in ${randomInt(100, 2000)}ms`,
        attributes: { "log.source": "seed-script" },
        ingestSource: "sdk",
      },
    });
  }

  console.log(`\n--- Summary ---`);
  console.log(`  Traces: ${NUM_TRACES} (${errorTraces} with errors)`);
  console.log(`  Spans:  ${totalSpans}`);
  console.log(`  Logs:   ${logCount}`);
  console.log(`  Project: ${project.name}`);
  console.log(`\nDone! MCP server should now have data to query.`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
