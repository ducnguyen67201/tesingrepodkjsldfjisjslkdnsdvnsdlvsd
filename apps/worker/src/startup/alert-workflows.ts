/**
 * Alert Workflow Startup
 *
 * Starts alert evaluation workflows for all enabled alerts.
 */

import { Client } from "@temporalio/client";
import { prisma } from "@ducsigr/db";
import { WORKFLOW_TIMEOUTS } from "@ducsigr/shared";
import type { AlertWorkflowInput } from "@/temporal/types";

/**
 * Start alert evaluation workflows for all enabled alerts.
 * Skips alerts that already have a running workflow.
 */
export async function startAlertWorkflows(
  client: Client,
  taskQueue: string
): Promise<{ started: number; skipped: number }> {
  // Get all enabled alerts
  const alerts = await prisma.alert.findMany({
    where: { enabled: true },
    select: {
      id: true,
      name: true,
      projectId: true,
      severity: true,
    },
  });

  if (alerts.length === 0) {
    return { started: 0, skipped: 0 };
  }

  let started = 0;
  let skipped = 0;

  for (const alert of alerts) {
    const workflowId = `alert-${alert.id}`;

    // Check if workflow is already running
    const isRunning = await isWorkflowRunning(client, workflowId);
    if (isRunning) {
      skipped++;
      continue;
    }

    // Start the workflow
    const input: AlertWorkflowInput = {
      alertId: alert.id,
      projectId: alert.projectId,
      alertName: alert.name,
      severity: alert.severity,
      evaluationIntervalMs: WORKFLOW_TIMEOUTS.ALERT.EVALUATION_INTERVAL_MS,
    };

    try {
      await client.workflow.start("alertEvaluationWorkflow", {
        taskQueue,
        workflowId,
        args: [input],
        workflowExecutionTimeout: WORKFLOW_TIMEOUTS.ALERT.WORKFLOW_EXECUTION,
      });
      started++;
    } catch (error) {
      console.error(`[Alerts] Failed to start workflow ${workflowId}:`, error);
    }
  }

  return { started, skipped };
}

/**
 * Check if a workflow is currently running
 */
async function isWorkflowRunning(client: Client, workflowId: string): Promise<boolean> {
  try {
    const handle = client.workflow.getHandle(workflowId);
    const description = await handle.describe();
    return description.status.name === "RUNNING";
  } catch {
    return false;
  }
}
