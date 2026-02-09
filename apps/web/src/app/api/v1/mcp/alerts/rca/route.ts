/**
 * MCP API: get_rca
 * Get full Root Cause Analysis detail for an alert incident.
 */
import { type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@ducsigr/db";
import { authenticateMcpRequest } from "@/lib/mcp-auth";
import { apiSuccess, apiError, apiServerError } from "@/lib/api-responses";
import { LLMRCAOutputSchema } from "@ducsigr/api/schemas";

const InputSchema = z.object({
  rcaId: z.string(),
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

  try {
    const rca = await prisma.alertRCA.findUnique({
      where: { id: parsed.data.rcaId },
      include: {
        alert: {
          include: {
            project: { select: { id: true, workspaceId: true } },
          },
        },
      },
    });

    if (!rca?.alert?.project || rca.alert.project.id !== auth.projectId) {
      return apiError.notFound("RCA");
    }

    // Validate analysis JSON
    const analysisResult = LLMRCAOutputSchema.safeParse(rca.analysisJson);

    // Fetch related commits
    const commits =
      rca.suspectedCommits.length > 0
        ? await prisma.gitCommit.findMany({
            where: { sha: { in: rca.suspectedCommits } },
            select: {
              sha: true,
              message: true,
              author: true,
              timestamp: true,
            },
            take: 10,
          })
        : [];

    // Fetch alert history for trigger value
    const alertHistory = await prisma.alertHistory.findFirst({
      where: { alertId: rca.alertId, triggeredAt: rca.triggeredAt },
      select: { value: true, state: true },
    });

    return apiSuccess.ok({
      rca: {
        id: rca.id,
        alertId: rca.alertId,
        triggeredAt: rca.triggeredAt,
        confidence: rca.confidence,
        suspectedCommits: rca.suspectedCommits,
        suspectedPRs: rca.suspectedPRs,
        analysis: analysisResult.success ? analysisResult.data : null,
      },
      alert: {
        id: rca.alert.id,
        name: rca.alert.name,
        type: rca.alert.type,
        severity: rca.alert.severity,
        threshold: rca.alert.threshold,
        operator: rca.alert.operator,
      },
      triggerValue: alertHistory?.value ?? null,
      commits,
    });
  } catch {
    return apiServerError.internal();
  }
}
