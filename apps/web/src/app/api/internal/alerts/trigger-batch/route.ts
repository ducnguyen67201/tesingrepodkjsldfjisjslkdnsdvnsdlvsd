/**
 * Internal API: Batch Trigger Alert Notifications
 *
 * Called by worker AlertEvaluator to send batched notifications.
 * Processes multiple alerts efficiently with severity-based dispatch.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@ducsigr/db";
import { validateInternalSecret } from "@ducsigr/shared";
import { env } from "@/lib/env";
import { AlertingAdapter } from "@ducsigr/api/lib/alerting";
import { initializeAlertingAdapters } from "@ducsigr/api/lib/alerting/init";
import {
  type ChannelProvider,
  type AlertType,
  type AlertOperator,
  type AlertState,
} from "@ducsigr/api/schemas";

// Initialize alerting adapters on module load
initializeAlertingAdapters();

const INTERNAL_SECRET_HEADER = "X-Internal-Secret";
const CACHE_CONTROL_NO_STORE = "no-store, no-cache, must-revalidate";

// Define schemas inline to avoid ESM import resolution issues in Next.js
const AlertSeveritySchema = z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]);
const AlertStateSchema = z.enum(["INACTIVE", "PENDING", "FIRING", "RESOLVED"]);
const AlertTypeSchema = z.enum(["ERROR_RATE", "LATENCY_P50", "LATENCY_P95", "LATENCY_P99"]);
const AlertOperatorSchema = z.enum(["GREATER_THAN", "LESS_THAN"]);

// Schema for batch trigger items (matches TriggerQueueItem from worker)
const BatchTriggerItemSchema = z.object({
  alertId: z.string(),
  alertName: z.string(),
  projectId: z.string(),
  projectName: z.string(),
  severity: AlertSeveritySchema,
  metricType: AlertTypeSchema,
  threshold: z.number(),
  actualValue: z.number(),
  operator: AlertOperatorSchema,
  previousState: AlertStateSchema,
  newState: AlertStateSchema,
  queuedAt: z.string(),
  channelIds: z.array(z.string()),
});

const BatchTriggerRequestSchema = z.object({
  alerts: z.array(BatchTriggerItemSchema),
});

type BatchTriggerItem = z.infer<typeof BatchTriggerItemSchema>;

type AlertResult = {
  alertId: string;
  success: boolean;
  notifiedVia: string[];
  errors: string[];
};

export async function POST(req: NextRequest) {
  const headers = { "Cache-Control": CACHE_CONTROL_NO_STORE };

  // 1. Validate internal secret
  const providedSecret = req.headers.get(INTERNAL_SECRET_HEADER);
  if (!validateInternalSecret(providedSecret, env.INTERNAL_API_SECRET)) {
    console.warn("Invalid internal API secret for batch trigger", {
      ip: req.headers.get("x-forwarded-for") || "unknown",
      timestamp: new Date().toISOString(),
    });
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401, headers }
    );
  }

  // 2. Parse and validate input
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON" },
      { status: 400, headers }
    );
  }

  const parseResult = BatchTriggerRequestSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      { success: false, error: "Invalid request", details: parseResult.error.flatten() },
      { status: 400, headers }
    );
  }

  const { alerts } = parseResult.data;

  if (alerts.length === 0) {
    return NextResponse.json(
      { success: true, results: [] },
      { status: 200, headers }
    );
  }

  // 3. Get all unique channel IDs
  const allChannelIds = [...new Set(alerts.flatMap((a) => a.channelIds))];

  // 4. Fetch all channels in one query
  const channels = await prisma.notificationChannel.findMany({
    where: { id: { in: allChannelIds } },
    select: {
      id: true,
      name: true,
      provider: true,
      config: true,
    },
  });

  const channelMap = new Map(channels.map((c) => [c.id, c]));

  // 5. Process each alert
  const results: AlertResult[] = [];

  for (const item of alerts) {
    const result = await processAlertNotification(item, channelMap);
    results.push(result);
  }

  const totalSuccess = results.filter((r) => r.success).length;
  console.log(`Batch trigger: ${totalSuccess}/${results.length} alerts processed`);

  return NextResponse.json(
    {
      success: true,
      processed: results.length,
      successful: totalSuccess,
      failed: results.length - totalSuccess,
      results,
    },
    { status: 200, headers }
  );
}

async function processAlertNotification(
  item: BatchTriggerItem,
  channelMap: Map<string, { id: string; name: string; provider: string; config: unknown }>
): Promise<AlertResult> {
  const notifiedVia: string[] = [];
  const errors: string[] = [];

  // Build payload for adapters
  const payload = {
    alertId: item.alertId,
    alertName: item.alertName,
    projectId: item.projectId,
    projectName: item.projectName,
    type: item.metricType as AlertType,
    threshold: item.threshold,
    actualValue: item.actualValue,
    operator: item.operator as AlertOperator,
    triggeredAt: item.queuedAt,
  };

  // Send to each channel
  for (const channelId of item.channelIds) {
    const channel = channelMap.get(channelId);
    if (!channel) {
      errors.push(`Channel ${channelId} not found`);
      continue;
    }

    try {
      const adapter = AlertingAdapter(channel.provider as ChannelProvider);
      const result = await adapter.send(channel.config, payload);

      if (result.success) {
        notifiedVia.push(`${channel.provider}:${channel.name}`);
      } else {
        errors.push(`${channel.provider}:${channel.name}: ${result.error}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      errors.push(`${channel.provider}:${channel.name}: ${message}`);
    }
  }

  // Record history and update alert
  try {
    await prisma.$transaction([
      prisma.alertHistory.create({
        data: {
          alertId: item.alertId,
          value: item.actualValue,
          threshold: item.threshold,
          state: item.newState as AlertState,
          previousState: item.previousState as AlertState,
          notifiedVia,
        },
      }),
      prisma.alert.update({
        where: { id: item.alertId },
        data: { lastTriggeredAt: new Date() },
      }),
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    errors.push(`Failed to record history: ${message}`);
  }

  return {
    alertId: item.alertId,
    success: notifiedVia.length > 0 || errors.length === 0,
    notifiedVia,
    errors,
  };
}
