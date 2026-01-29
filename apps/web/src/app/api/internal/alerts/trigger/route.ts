/**
 * Internal API: Trigger Alert Notification
 *
 * Called by worker when an alert is triggered.
 * Sends notifications via all linked channels.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@ducsigr/db";
import { validateInternalSecret } from "@ducsigr/shared";
import { env } from "@/lib/env";
import { AlertingAdapter } from "@ducsigr/api/lib/alerting";
import { initializeAlertingAdapters } from "@ducsigr/api/lib/alerting/init";
import { type ChannelProvider } from "@ducsigr/api/schemas";
import { internalApiError, internalApiSuccess } from "@/lib/api-responses";

// Initialize alerting adapters on module load
initializeAlertingAdapters();

const INTERNAL_SECRET_HEADER = "X-Internal-Secret";

// Define schema inline to avoid bundling issues
const AlertPayloadSchema = z.object({
  alertId: z.string(),
  alertName: z.string(),
  projectId: z.string(),
  projectName: z.string(),
  type: z.enum(["ERROR_RATE", "LATENCY_P50", "LATENCY_P95", "LATENCY_P99"]),
  threshold: z.number(),
  actualValue: z.number(),
  operator: z.enum(["GREATER_THAN", "LESS_THAN"]),
  triggeredAt: z.string(),
  dashboardUrl: z.string().url().optional(),
});

type AlertPayload = z.infer<typeof AlertPayloadSchema>;

const TriggerAlertSchema = z.object({
  alertId: z.string(),
  payload: AlertPayloadSchema,
});

type ChannelResult = {
  channelId: string;
  channelName: string;
  provider: string;
  success: boolean;
  error?: string;
};

export async function POST(req: NextRequest) {
  // 1. Validate internal secret
  const providedSecret = req.headers.get(INTERNAL_SECRET_HEADER);
  if (!validateInternalSecret(providedSecret, env.INTERNAL_API_SECRET)) {
    console.warn("Invalid internal API secret attempt for alert trigger", {
      ip: req.headers.get("x-forwarded-for") || "unknown",
      timestamp: new Date().toISOString(),
    });
    return internalApiError.unauthorized();
  }

  // 2. Parse and validate input
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return internalApiError.invalidJson();
  }

  const parseResult = TriggerAlertSchema.safeParse(body);
  if (!parseResult.success) {
    return internalApiError.validation("Invalid request", parseResult.error.flatten());
  }

  const { alertId, payload } = parseResult.data;

  try {
    // 3. Get alert with all linked channels
    const alert = await prisma.alert.findUnique({
      where: { id: alertId },
      include: {
        channels: true, // Legacy per-alert channels
        channelLinks: {
          include: {
            channel: true, // Workspace-level channels
          },
        },
      },
    });

    if (!alert) {
      return internalApiError.notFound("Alert");
    }

    // 4. Send notifications to all channels
    const results: ChannelResult[] = [];
    const notifiedVia: string[] = [];

    // Legacy per-alert channels
    for (const channel of alert.channels) {
      const result = await sendToChannel(
        channel.id,
        channel.provider,
        channel.provider,
        channel.config,
        payload
      );
      results.push(result);
      if (result.success) {
        notifiedVia.push(channel.provider);
      }
    }

    // Workspace-level channels (via links)
    for (const link of alert.channelLinks) {
      const { channel } = link;
      const result = await sendToChannel(
        channel.id,
        channel.name,
        channel.provider,
        channel.config,
        payload
      );
      results.push(result);
      if (result.success) {
        notifiedVia.push(`${channel.provider}:${channel.name}`);
      }
    }

    // 5. Record history and update last triggered
    await prisma.$transaction([
      prisma.alertHistory.create({
        data: {
          alertId,
          value: payload.actualValue,
          threshold: payload.threshold,
          notifiedVia,
        },
      }),
      prisma.alert.update({
        where: { id: alertId },
        data: { lastTriggeredAt: new Date() },
      }),
    ]);

    const successCount = results.filter((r) => r.success).length;
    console.log(
      `Alert "${payload.alertName}" triggered - ${successCount}/${results.length} notifications sent`
    );

    return internalApiSuccess.ok({ alertId, results, notifiedVia });
  } catch (error) {
    console.error("Error triggering alert notification:", error);
    return internalApiError.internal();
  }
}

async function sendToChannel(
  channelId: string,
  channelName: string,
  provider: string,
  config: unknown,
  payload: AlertPayload
): Promise<ChannelResult> {
  try {
    const adapter = AlertingAdapter(provider as ChannelProvider);
    const result = await adapter.send(config, payload);

    if (result.success) {
      console.log(`Sent notification via ${provider} (${channelName})`);
      return { channelId, channelName, provider, success: true };
    } else {
      console.error(`Failed to send via ${provider} (${channelName}):`, result.error);
      return { channelId, channelName, provider, success: false, error: result.error };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`Error sending via ${provider} (${channelName}):`, message);
    return { channelId, channelName, provider, success: false, error: message };
  }
}
