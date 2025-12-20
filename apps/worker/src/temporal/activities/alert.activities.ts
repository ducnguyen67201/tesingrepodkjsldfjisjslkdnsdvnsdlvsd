// ============================================================
// ALERT ACTIVITIES - Orchestration for alert evaluation
// ============================================================
// IMPORTANT: Temporal activities are READ-ONLY for database.
// All mutations go through tRPC internal procedures.
// ============================================================

import { prisma } from "@cognobserve/db";
import { SEVERITY_DEFAULTS } from "@cognobserve/api/schemas";
import { getInternalCaller } from "@/lib/trpc-caller";
import type { AlertEvaluationResult, AlertStateTransition } from "../types";

// Time constant
const MS_PER_MINUTE = 60_000;

/**
 * Evaluate alert condition against current metrics.
 * READ-ONLY operation - only reads metrics data.
 *
 * @returns Whether the threshold condition is met and metric data
 */
export async function evaluateAlert(alertId: string): Promise<AlertEvaluationResult> {
  console.log(`[Activity:evaluateAlert] Evaluating alert: ${alertId}`);

  const alert = await prisma.alert.findUnique({
    where: { id: alertId },
    include: { project: true },
  });

  if (!alert || !alert.enabled) {
    console.log(`[Activity:evaluateAlert] Alert disabled or not found`);
    return {
      alertId,
      conditionMet: false,
      currentValue: 0,
      threshold: alert?.threshold ?? 0,
      sampleCount: 0,
    };
  }

  const windowStart = new Date(Date.now() - alert.windowMins * MS_PER_MINUTE);
  let currentValue = 0;
  let sampleCount = 0;

  // Calculate metric based on alert type (READ-ONLY)
  if (alert.type === "ERROR_RATE") {
    const counts = await prisma.span.groupBy({
      by: ["statusCode"],
      where: {
        trace: { projectId: alert.projectId },
        startTime: { gte: windowStart },
      },
      _count: true,
    });

    const total = counts.reduce((sum, c) => sum + (c._count ?? 0), 0);
    const errors = counts.find((c) => c.statusCode === "ERROR")?._count ?? 0;
    currentValue = total > 0 ? (errors / total) * 100 : 0;
    sampleCount = total;
  } else if (alert.type.startsWith("LATENCY_")) {
    // P50, P95, P99 latency calculations
    const percentile =
      alert.type === "LATENCY_P50" ? 0.5 : alert.type === "LATENCY_P95" ? 0.95 : 0.99;

    const spans = await prisma.$queryRaw<Array<{ latency: number }>>`
      SELECT EXTRACT(EPOCH FROM ("endTime" - "startTime")) * 1000 as latency
      FROM "Span" s
      JOIN "Trace" t ON s."traceId" = t.id
      WHERE t."projectId" = ${alert.projectId}
        AND s."startTime" >= ${windowStart}
        AND s."endTime" IS NOT NULL
      ORDER BY latency
    `;

    sampleCount = spans.length;
    if (sampleCount > 0) {
      const idx = Math.floor(sampleCount * percentile);
      currentValue = spans[Math.min(idx, sampleCount - 1)]?.latency ?? 0;
    }
  }

  // Check condition (calculation only, no mutation)
  const conditionMet =
    alert.operator === "GREATER_THAN"
      ? currentValue > alert.threshold
      : currentValue < alert.threshold;

  console.log(
    `[Activity:evaluateAlert] ${alert.name}: value=${currentValue.toFixed(2)} ` +
    `threshold=${alert.threshold} condition=${conditionMet ? "MET" : "NOT MET"}`
  );

  return {
    alertId,
    conditionMet,
    currentValue,
    threshold: alert.threshold,
    sampleCount,
  };
}

/**
 * Transition alert state via internal tRPC.
 * Temporal activities are read-only - mutations go through tRPC.
 *
 * @returns State transition result including whether notification should be sent
 */
export async function transitionAlertState(
  alertId: string,
  conditionMet: boolean
): Promise<AlertStateTransition> {
  console.log(`[Activity:transitionAlertState] Processing: ${alertId}`);

  const caller = getInternalCaller();
  const result = await caller.internal.transitionAlertState({
    alertId,
    conditionMet,
  });

  console.log(
    `[Activity:transitionAlertState] ${result.previousState} → ${result.newState} (notify: ${result.shouldNotify})`
  );

  return result;
}

/**
 * Dispatch notification via internal tRPC.
 * Temporal activities are read-only - mutations go through tRPC.
 *
 * @returns True if notification was sent successfully
 */
export async function dispatchNotification(
  alertId: string,
  state: string,
  value: number,
  threshold: number
): Promise<boolean> {
  console.log(`[Activity:dispatchNotification] Dispatching for: ${alertId}`);

  try {
    const caller = getInternalCaller();
    const result = await caller.internal.dispatchNotification({
      alertId,
      state,
      value,
      threshold,
    });

    console.log(
      `[Activity:dispatchNotification] Sent to ${result.channelCount} channels`
    );
    return true;
  } catch (error) {
    console.error(`[Activity:dispatchNotification] Failed:`, error);
    return false;
  }
}

// ============================================================
// READ-ONLY HELPER FUNCTIONS (Database reads are allowed)
// ============================================================

/**
 * Get alert details for evaluation timing (read-only)
 */
export async function getAlertDetails(alertId: string): Promise<{
  id: string;
  name: string;
  enabled: boolean;
  severity: string;
  pendingMins: number;
  cooldownMins: number;
} | null> {
  const alert = await prisma.alert.findUnique({
    where: { id: alertId },
    select: {
      id: true,
      name: true,
      enabled: true,
      severity: true,
      pendingMins: true,
      cooldownMins: true,
    },
  });

  if (!alert) return null;

  // Apply severity defaults if custom values not set
  const defaults = SEVERITY_DEFAULTS[alert.severity as keyof typeof SEVERITY_DEFAULTS];
  return {
    id: alert.id,
    name: alert.name,
    enabled: alert.enabled,
    severity: alert.severity,
    pendingMins: alert.pendingMins ?? defaults?.pendingMins ?? 3,
    cooldownMins: alert.cooldownMins ?? defaults?.cooldownMins ?? 30,
  };
}

/**
 * Get all active alerts for a project (read-only)
 */
export async function getActiveAlerts(projectId: string): Promise<string[]> {
  const alerts = await prisma.alert.findMany({
    where: { projectId, enabled: true },
    select: { id: true },
  });
  return alerts.map((a) => a.id);
}
