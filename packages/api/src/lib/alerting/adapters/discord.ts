/**
 * Discord Adapter
 *
 * Discord webhook adapter for sending alert notifications.
 */

import { BaseAlertingAdapter } from "../adapter";
import type { SendResult } from "../../../schemas/alerting";
import {
  AlertPayload,
  DiscordConfigSchema,
  DiscordConfig,
  ALERT_TYPE_LABELS,
  formatAlertValue,
  getOperatorSymbol,
  formatConfidence,
  RCA_CATEGORY_LABELS,
  RCA_CATEGORY_ICONS,
  type RCASummary,
} from "../../../schemas/alerting";

/**
 * Discord embed structure
 * @see https://discord.com/developers/docs/resources/message#embed-object
 */
interface DiscordEmbed {
  title: string;
  description?: string;
  color: number;
  fields: Array<{
    name: string;
    value: string;
    inline?: boolean;
  }>;
  timestamp?: string;
  footer?: {
    text: string;
    icon_url?: string;
  };
  thumbnail?: {
    url: string;
  };
}

/**
 * Discord webhook adapter for sending alert notifications.
 *
 * @example
 * ```ts
 * const adapter = new DiscordAdapter();
 * await adapter.send(
 *   { webhookUrl: "https://discord.com/api/webhooks/..." },
 *   payload
 * );
 * ```
 */
export class DiscordAdapter extends BaseAlertingAdapter {
  readonly provider = "DISCORD" as const;

  /**
   * Validate Discord-specific configuration
   */
  validateConfig(config: unknown): DiscordConfig {
    return DiscordConfigSchema.parse(config);
  }

  /**
   * Send alert notification via Discord webhook
   */
  async send(config: unknown, payload: AlertPayload): Promise<SendResult> {
    try {
      const validConfig = this.validateConfig(config);
      const embed = this.buildEmbed(payload);

      const response = await fetch(validConfig.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ embeds: [embed] }),
      });

      if (!response.ok) {
        const text = await response.text();
        return this.createErrorResult(
          `Discord API error: ${response.status} - ${text}`
        );
      }

      return this.createSuccessResult();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return this.createErrorResult(message);
    }
  }

  /**
   * Build Discord embed object with optional RCA sections
   */
  private buildEmbed(payload: AlertPayload): DiscordEmbed {
    const typeLabel = ALERT_TYPE_LABELS[payload.type];
    const operatorSymbol = getOperatorSymbol(payload.operator);
    const valueFormatted = formatAlertValue(payload.type, payload.actualValue);
    const thresholdFormatted = formatAlertValue(payload.type, payload.threshold);
    const color = this.getColor(payload.type);

    // Base fields
    const fields: DiscordEmbed["fields"] = [
      {
        name: typeLabel,
        value: `**${valueFormatted}**`,
        inline: true,
      },
      {
        name: "Threshold",
        value: `${operatorSymbol} ${thresholdFormatted}`,
        inline: true,
      },
      {
        name: "Project",
        value: payload.projectName,
        inline: true,
      },
    ];

    // Add RCA fields if available
    if (payload.rca) {
      fields.push(...this.buildRCAFields(payload.rca));
    }

    // Dashboard link (if available and no RCA)
    if (payload.dashboardUrl && !payload.rca) {
      fields.push({
        name: "📈 Dashboard",
        value: `[View Dashboard](${payload.dashboardUrl})`,
        inline: false,
      });
    }

    return {
      title: `🚨 Alert: ${payload.alertName}`,
      description: `Alert triggered for **${payload.projectName}**`,
      color,
      fields,
      timestamp: payload.triggeredAt,
      footer: {
        text: payload.rca
          ? "CognObserve • AI-Powered Root Cause Analysis"
          : "CognObserve Alerting",
      },
    };
  }

  /**
   * Build RCA-specific embed fields
   */
  private buildRCAFields(rca: RCASummary): DiscordEmbed["fields"] {
    const fields: DiscordEmbed["fields"] = [];
    const categoryIcon = RCA_CATEGORY_ICONS[rca.category];
    const categoryLabel = RCA_CATEGORY_LABELS[rca.category];

    // Separator
    fields.push({ name: "\u200B", value: "───────────────", inline: false });

    // RCA Analysis section
    fields.push({
      name: "🔍 Root Cause Analysis",
      value: rca.hypothesis,
      inline: false,
    });

    fields.push({
      name: "Confidence",
      value: formatConfidence(rca.confidence),
      inline: true,
    });

    fields.push({
      name: "Category",
      value: `${categoryIcon} ${categoryLabel}`,
      inline: true,
    });

    // Related change (if available)
    if (rca.topChange) {
      const changeIcon = rca.topChange.type === "commit" ? "📝" : "🔀";
      const changeLabel = rca.topChange.type === "commit" ? "Commit" : "PR";
      fields.push({
        name: `${changeIcon} Related ${changeLabel}`,
        value: `\`${rca.topChange.id.slice(0, 7)}\` - ${rca.topChange.summary}\nby ${rca.topChange.author}`,
        inline: false,
      });
    }

    // Recommended actions
    if (rca.remediation.length > 0) {
      const remediationList = rca.remediation.map((r, i) => `${i + 1}. ${r}`).join("\n");
      fields.push({
        name: "🛠️ Recommended Actions",
        value: remediationList,
        inline: false,
      });
    }

    // Full analysis link
    fields.push({
      name: "📊 Full Analysis",
      value: `[View Complete RCA](${rca.detailUrl})`,
      inline: false,
    });

    return fields;
  }

  /**
   * Get embed color based on alert type
   * Colors are in decimal format
   */
  private getColor(type: AlertPayload["type"]): number {
    // Red for errors, orange for latency
    if (type === "ERROR_RATE") {
      return 0xdc2626; // Red
    }
    return 0xf59e0b; // Amber
  }
}
