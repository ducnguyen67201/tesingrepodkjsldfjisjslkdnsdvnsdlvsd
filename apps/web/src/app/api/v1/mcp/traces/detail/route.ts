/**
 * MCP API: get_trace
 * Returns a single trace with all its spans.
 */
import { type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@ducsigr/db";
import { authenticateMcpRequest } from "@/lib/mcp-auth";
import { apiSuccess, apiError, apiServerError } from "@/lib/api-responses";

const InputSchema = z.object({
  traceId: z.string(),
  includeInputOutput: z.boolean().default(true),
});

export async function POST(req: NextRequest) {
  const auth = await authenticateMcpRequest(req);
  if (!auth.success) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError.invalidJson();
  }

  const parsed = InputSchema.safeParse(body);
  if (!parsed.success) {
    return apiError.validation("Invalid input", parsed.error.flatten());
  }

  const input = parsed.data;

  try {
    const spanSelect: Record<string, boolean> = {
      id: true,
      externalSpanId: true,
      parentSpanId: true,
      name: true,
      kind: true,
      spanType: true,
      statusCode: true,
      statusMessage: true,
      startTime: true,
      endTime: true,
      durationMs: true,
      model: true,
      promptTokens: true,
      completionTokens: true,
      totalCost: true,
      httpMethod: true,
      httpRoute: true,
      httpStatusCode: true,
      dbSystem: true,
      dbOperation: true,
      exceptionType: true,
      exceptionMessage: true,
    };

    if (input.includeInputOutput) {
      spanSelect.input = true;
      spanSelect.output = true;
    }

    const trace = await prisma.trace.findFirst({
      where: {
        id: input.traceId,
        projectId: auth.projectId,
      },
      select: {
        id: true,
        serviceName: true,
        durationMs: true,
        startTime: true,
        hasError: true,
        spans: {
          orderBy: { startTime: "asc" },
          select: spanSelect,
        },
      },
    });

    if (!trace) {
      return apiError.notFound("Trace");
    }

    // Convert Decimal totalCost to number for JSON serialization
    const spans = trace.spans.map((span) => ({
      ...span,
      totalCost: span.totalCost !== null ? Number(span.totalCost) : null,
    }));

    return apiSuccess.ok({
      trace: {
        ...trace,
        spans,
      },
    });
  } catch {
    return apiServerError.internal();
  }
}
