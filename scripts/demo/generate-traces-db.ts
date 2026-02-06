#!/usr/bin/env tsx
/**
 * Generate traces with realistic LLM input/output and logs
 */

import crypto from "crypto";

const TRACE_COUNT = 500;
const models = ["gpt-4", "gpt-4-turbo", "gpt-3.5-turbo", "claude-3-opus", "claude-3-sonnet"];

// Sample customer inquiries for realistic demo data
const CUSTOMER_INQUIRIES = [
  { name: "John Smith", inquiry: "Where is my order #12345? It's been 5 days and I haven't received it.", context: "Order placed 5 days ago, shipped via Standard" },
  { name: "Sarah Johnson", inquiry: "I want to return the blue dress I bought last week. It doesn't fit.", context: "Order #67890, purchased 7 days ago, $89.99" },
  { name: "Mike Chen", inquiry: "Why was I charged twice for my subscription?", context: "Premium subscription, $19.99/month, two charges on Jan 15" },
  { name: "Emily Davis", inquiry: "The laptop I received has a cracked screen. This is unacceptable!", context: "MacBook Pro, Order #11111, delivered yesterday" },
  { name: "Alex Wilson", inquiry: "Can I change the shipping address for my pending order?", context: "Order #22222, not yet shipped, current address: 123 Main St" },
  { name: "Lisa Brown", inquiry: "I forgot my password and the reset email never arrived.", context: "Account created 2 years ago, last login 30 days ago" },
  { name: "David Lee", inquiry: "Do you offer student discounts on your premium plan?", context: "Free tier user, .edu email verified" },
  { name: "Rachel Green", inquiry: "The promo code SAVE20 isn't working at checkout.", context: "Cart total: $150, promo valid until end of month" },
  { name: "Tom Anderson", inquiry: "I accidentally deleted my project. Can you restore it?", context: "Pro plan user, project 'Q4 Marketing' deleted 2 hours ago" },
  { name: "Jennifer Martinez", inquiry: "How do I export my data in CSV format?", context: "Business plan, 50,000 records in account" },
];

// Sample LLM responses
const RESPONSE_TEMPLATES = {
  success: [
    "Hi {name}! I understand your concern about {topic}. Let me help you with that.\n\nI've looked into your account and here's what I found: {details}\n\nTo resolve this, you can: {solution}\n\nIs there anything else I can help you with?",
    "Hello {name}, thank you for reaching out!\n\nI've reviewed your request regarding {topic}. {details}\n\nHere's what I recommend: {solution}\n\nPlease let me know if you need further assistance.",
    "Dear {name},\n\nThank you for contacting us about {topic}. I apologize for any inconvenience.\n\n{details}\n\nNext steps: {solution}\n\nFeel free to reach out if you have any questions!",
  ],
  error: [
    "I apologize, but I encountered an issue while processing your request. Please try again in a few moments.",
    "I'm sorry, I wasn't able to complete your request due to a temporary system issue. Our team has been notified.",
    "Unfortunately, I couldn't retrieve the information you requested. Please contact our support team directly.",
  ],
};

// Error scenarios for debugging demo
const ERROR_SCENARIOS = [
  { type: "rate_limit", message: "Rate limit exceeded. Please retry after 60 seconds.", statusMessage: "OpenAI API rate limit exceeded" },
  { type: "context_length", message: "The input exceeds the maximum context length of 8192 tokens.", statusMessage: "Context length exceeded" },
  { type: "timeout", message: "Request timed out after 30 seconds.", statusMessage: "LLM request timeout" },
  { type: "invalid_response", message: "The model returned an invalid JSON response.", statusMessage: "Invalid response format" },
  { type: "content_filter", message: "Content was filtered due to safety guidelines.", statusMessage: "Content policy violation" },
];

function generateLLMInput(inquiry: typeof CUSTOMER_INQUIRIES[0], model: string) {
  return {
    messages: [
      {
        role: "system",
        content: `You are a helpful customer support agent for an e-commerce company.

Guidelines:
- Be professional, empathetic, and concise
- Always acknowledge the customer's concern first
- Provide clear next steps when applicable
- If you don't have enough information, ask clarifying questions

Tone: Friendly but professional`,
      },
      {
        role: "user",
        content: `Customer Name: ${inquiry.name}
Inquiry: ${inquiry.inquiry}

Context from our system:
${inquiry.context}

Please provide a helpful response.`,
      },
    ],
    model,
    temperature: 0.7,
    max_tokens: 500,
  };
}

function generateLLMOutput(inquiry: typeof CUSTOMER_INQUIRIES[0], scenario: string) {
  if (scenario === "error") {
    const error = ERROR_SCENARIOS[Math.floor(Math.random() * ERROR_SCENARIOS.length)]!;
    return { error: error.message, errorType: error.type };
  }

  const template = RESPONSE_TEMPLATES.success[Math.floor(Math.random() * RESPONSE_TEMPLATES.success.length)]!;
  const response = template
    .replace("{name}", inquiry.name.split(" ")[0]!)
    .replace("{topic}", inquiry.inquiry.split(".")[0]!.toLowerCase())
    .replace("{details}", inquiry.context)
    .replace("{solution}", "I've initiated the process and you should see the update within 24 hours.");

  return {
    choices: [
      {
        message: { role: "assistant", content: response },
        finish_reason: "stop",
      },
    ],
    usage: {
      prompt_tokens: Math.floor(200 + Math.random() * 300),
      completion_tokens: Math.floor(100 + Math.random() * 200),
    },
  };
}

async function main() {
  const { prisma } = await import("../../packages/db/src/index.js");

  const project = await prisma.project.findFirst({
    where: { name: "Support Copilot" },
  });

  if (!project) {
    console.log("❌ Project not found. Run demo seeder first.");
    process.exit(1);
  }

  console.log(`Found project: ${project.name} (${project.id})`);

  const promptVersions = await prisma.promptVersion.findMany({
    where: { prompt: { projectId: project.id } },
    select: { id: true },
  });
  const versionIds = promptVersions.map((v) => v.id);

  const variants = await prisma.promptExperimentVariant.findMany({
    where: { experiment: { projectId: project.id } },
    select: { id: true },
  });
  const variantIds = variants.map((v) => v.id);

  console.log(`Prompt versions: ${versionIds.length}, Variants: ${variantIds.length}`);
  console.log(`\nGenerating ${TRACE_COUNT} traces with input/output and logs...\n`);

  let successCount = 0, slowCount = 0, errorCount = 0, retryCount = 0;
  let logCount = 0;

  for (let i = 0; i < TRACE_COUNT; i++) {
    const traceId = crypto.randomBytes(16).toString("hex");
    const model = models[Math.floor(Math.random() * models.length)]!;
    const inquiry = CUSTOMER_INQUIRIES[Math.floor(Math.random() * CUSTOMER_INQUIRIES.length)]!;

    // Determine scenario
    const roll = Math.random();
    let scenario: string;
    if (roll < 0.7) { scenario = "success"; successCount++; }
    else if (roll < 0.85) { scenario = "slow"; slowCount++; }
    else if (roll < 0.95) { scenario = "error"; errorCount++; }
    else { scenario = "retry"; retryCount++; }

    // Random timestamp in last 7 days
    const hoursAgo = Math.random() * 168;
    const startTime = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);

    // Latency based on scenario
    let latencyMs: number;
    if (scenario === "slow") latencyMs = 2000 + Math.random() * 8000;
    else if (scenario === "error") latencyMs = 100 + Math.random() * 400;
    else latencyMs = 200 + Math.random() * 600;

    const endTime = new Date(startTime.getTime() + latencyMs);
    const durationMs = Math.floor(latencyMs);

    // Generate LLM input/output
    const llmInput = generateLLMInput(inquiry, model);
    const llmOutput = generateLLMOutput(inquiry, scenario);

    const promptTokens = "usage" in llmOutput ? llmOutput.usage.prompt_tokens : Math.floor(200 + Math.random() * 300);
    const completionTokens = "usage" in llmOutput ? llmOutput.usage.completion_tokens : 0;
    const totalTokens = promptTokens + completionTokens;

    const promptVersionId = versionIds.length > 0 ? versionIds[Math.floor(Math.random() * versionIds.length)] : null;
    const variantId = Math.random() > 0.7 && variantIds.length > 0 ? variantIds[Math.floor(Math.random() * variantIds.length)] : null;

    const rootSpanId = crypto.randomBytes(8).toString("hex");
    const llmSpanId = crypto.randomBytes(8).toString("hex");
    const envValue = Math.random() > 0.5 ? "production" : "staging";

    const errorInfo = scenario === "error" ? ERROR_SCENARIOS[Math.floor(Math.random() * ERROR_SCENARIOS.length)]! : null;

    // Create trace with spans
    const trace = await prisma.trace.create({
      data: {
        projectId: project.id,
        externalTraceId: traceId,
        serviceName: "support-copilot",
        serviceVersion: "1.0.0",
        environment: envValue,
        startTime,
        endTime,
        durationMs,
        spanCount: 2,
        errorCount: scenario === "error" ? 1 : 0,
        rootSpanId,
        rootSpanName: "support-copilot-request",
        rootSpanKind: "SERVER",
        rootSpanStatusCode: scenario === "error" ? "ERROR" : "OK",
        rootSpanDurationMs: durationMs,
        spans: {
          create: [
            {
              externalSpanId: rootSpanId,
              name: "support-copilot-request",
              kind: "SERVER",
              statusCode: scenario === "error" ? "ERROR" : "OK",
              statusMessage: errorInfo?.statusMessage || null,
              startTime,
              endTime,
              durationMs,
              attributes: {
                "service.name": "support-copilot",
                scenario,
                "customer.name": inquiry.name,
                "request.type": "support_inquiry",
              },
            },
            {
              externalSpanId: llmSpanId,
              parentSpanId: rootSpanId,
              name: `chat ${model}`,
              kind: "CLIENT",
              statusCode: scenario === "error" ? "ERROR" : "OK",
              statusMessage: errorInfo?.statusMessage || null,
              startTime: new Date(startTime.getTime() + 50),
              endTime: new Date(endTime.getTime() - 20),
              durationMs: Math.max(0, durationMs - 70),
              model,
              input: llmInput,
              output: llmOutput,
              promptTokens,
              completionTokens,
              totalTokens,
              promptVersionId,
              promptVariantId: variantId,
              attributes: {
                "gen_ai.system": model.startsWith("gpt") ? "openai" : "anthropic",
                "gen_ai.request.model": model,
                "gen_ai.request.temperature": 0.7,
                "gen_ai.request.max_tokens": 500,
              },
            },
          ],
        },
      },
    });

    // Create log records (traceId and spanId are external IDs for correlation)
    const logRecords = [
      {
        projectId: project.id,
        traceId: traceId,
        spanId: rootSpanId,
        timestamp: startTime,
        severityNumber: 9,
        severityText: "INFO",
        bodyText: `Support request received from ${inquiry.name}`,
        attributes: { "event": "request.start", "customer.name": inquiry.name },
        serviceName: "support-copilot",
      },
      {
        projectId: project.id,
        traceId: traceId,
        spanId: llmSpanId,
        timestamp: new Date(startTime.getTime() + 50),
        severityNumber: 5,
        severityText: "DEBUG",
        bodyText: `Calling LLM: ${model} with ${promptTokens} prompt tokens`,
        attributes: { "event": "llm.call", "model": model },
        serviceName: "support-copilot",
      },
    ];

    // Add scenario-specific logs
    if (scenario === "error") {
      logRecords.push({
        projectId: project.id,
        traceId: traceId,
        spanId: llmSpanId,
        timestamp: endTime,
        severityNumber: 17,
        severityText: "ERROR",
        bodyText: errorInfo?.message || "LLM request failed",
        attributes: { "event": "error", "error.type": errorInfo?.type || "unknown" },
        serviceName: "support-copilot",
      });
    } else if (scenario === "slow") {
      logRecords.push({
        projectId: project.id,
        traceId: traceId,
        spanId: llmSpanId,
        timestamp: new Date(startTime.getTime() + 2000),
        severityNumber: 13,
        severityText: "WARN",
        bodyText: `LLM response taking longer than expected (${durationMs}ms)`,
        attributes: { "event": "slow_response", "duration_ms": durationMs },
        serviceName: "support-copilot",
      });
    }

    // Success log
    if (scenario !== "error") {
      logRecords.push({
        projectId: project.id,
        traceId: traceId,
        spanId: rootSpanId,
        timestamp: endTime,
        severityNumber: 9,
        severityText: "INFO",
        bodyText: `Support request completed successfully in ${durationMs}ms`,
        attributes: { "event": "request.complete", "duration_ms": durationMs, "tokens_used": totalTokens },
        serviceName: "support-copilot",
      });
    }

    await prisma.logRecord.createMany({ data: logRecords });
    logCount += logRecords.length;

    if ((i + 1) % 50 === 0) {
      console.log(`  Created ${i + 1}/${TRACE_COUNT} traces`);
    }
  }

  console.log(`\n✅ Done! Created ${TRACE_COUNT} traces and ${logCount} log records`);
  console.log(`\nScenario distribution:`);
  console.log(`  Success: ${successCount} (${((successCount / TRACE_COUNT) * 100).toFixed(1)}%)`);
  console.log(`  Slow: ${slowCount} (${((slowCount / TRACE_COUNT) * 100).toFixed(1)}%)`);
  console.log(`  Error: ${errorCount} (${((errorCount / TRACE_COUNT) * 100).toFixed(1)}%)`);
  console.log(`  Retry: ${retryCount} (${((retryCount / TRACE_COUNT) * 100).toFixed(1)}%)`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("❌ Error:", e);
  process.exit(1);
});
