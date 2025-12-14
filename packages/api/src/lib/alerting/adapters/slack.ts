/**
 * Slack Adapter
 *
 * Slack webhook adapter for sending alert notifications with Block Kit.
 */

import { BaseAlertingAdapter } from "../adapter";
import type { SendResult } from "../../../schemas/alerting";
import {
  AlertPayload,
  SlackConfigSchema,
  SlackConfig,
  ALERT_TYPE_LABELS,
  formatAlertValue,
  getOperatorSymbol,
  formatConfidence,
  RCA_CATEGORY_LABELS,
  RCA_CATEGORY_ICONS,
  type RCASummary,
} from "../../../schemas/alerting";

/**
 * Slack Block Kit block types
 * @see https://api.slack.com/reference/block-kit/blocks
 */
type SlackBlock =
  | SlackHeaderBlock
  | SlackSectionBlock
  | SlackContextBlock
  | SlackDividerBlock
  | SlackActionsBlock;

interface SlackHeaderBlock {
  type: "header";
  text: { type: "plain_text"; text: string; emoji?: boolean };
}

interface SlackSectionBlock {
  type: "section";
  text?: { type: "mrkdwn"; text: string };
  fields?: Array<{ type: "mrkdwn"; text: string }>;
  accessory?: SlackButton | SlackImage;
}

interface SlackContextBlock {
  type: "context";
  elements: Array<
    | { type: "mrkdwn"; text: string }
    | { type: "image"; image_url: string; alt_text: string }
  >;
}

interface SlackDividerBlock {
  type: "divider";
}

interface SlackActionsBlock {
  type: "actions";
  elements: SlackButton[];
}

interface SlackButton {
  type: "button";
  text: { type: "plain_text"; text: string; emoji?: boolean };
  url?: string;
  style?: "primary" | "danger";
  action_id: string;
}

interface SlackImage {
  type: "image";
  image_url: string;
  alt_text: string;
}

/**
 * Slack webhook adapter for sending alert notifications.
 *
 * Uses Slack Block Kit for rich message formatting.
 *
 * @example
 * ```ts
 * const adapter = new SlackAdapter();
 * await adapter.send(
 *   { webhookUrl: "https://hooks.slack.com/services/..." },
 *   payload
 * );
 * ```
 */
export class SlackAdapter extends BaseAlertingAdapter {
  readonly provider = "SLACK" as const;

  /**
   * Validate Slack-specific configuration
   */
  validateConfig(config: unknown): SlackConfig {
    return SlackConfigSchema.parse(config);
  }

  /**
   * Send alert notification via Slack webhook
   */
  async send(config: unknown, payload: AlertPayload): Promise<SendResult> {
    try {
      const validConfig = this.validateConfig(config);
      const blocks = this.buildBlocks(payload);

      const response = await fetch(validConfig.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blocks,
          text: `Alert: ${payload.alertName} - ${payload.projectName}`, // Fallback text
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        // Attempt to parse JSON error response from Slack
        let errorMessage = text;
        try {
          const json = JSON.parse(text) as { error?: string; message?: string };
          errorMessage = json.error ?? json.message ?? text;
        } catch {
          // Response is not JSON, use raw text
        }
        return this.createErrorResult(
          `Slack API error: ${response.status} - ${errorMessage}`
        );
      }

      return this.createSuccessResult();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return this.createErrorResult(message);
    }
  }

  /**
   * Build Slack Block Kit blocks
   */
  private buildBlocks(payload: AlertPayload): SlackBlock[] {
    const typeLabel = ALERT_TYPE_LABELS[payload.type];
    const operatorSymbol = getOperatorSymbol(payload.operator);
    const valueFormatted = formatAlertValue(payload.type, payload.actualValue);
    const thresholdFormatted = formatAlertValue(payload.type, payload.threshold);

    const blocks: SlackBlock[] = [];

    // Header
    blocks.push({
      type: "header",
      text: {
        type: "plain_text",
        text: `🚨 Alert: ${payload.alertName}`,
        emoji: true,
      },
    });

    // Alert details section
    blocks.push({
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*${typeLabel}*\n${valueFormatted}` },
        {
          type: "mrkdwn",
          text: `*Threshold*\n${operatorSymbol} ${thresholdFormatted}`,
        },
        { type: "mrkdwn", text: `*Project*\n${payload.projectName}` },
        {
          type: "mrkdwn",
          text: `*Triggered*\n<!date^${Math.floor(new Date(payload.triggeredAt).getTime() / 1000)}^{date_short_pretty} at {time}|${payload.triggeredAt}>`,
        },
      ],
    });

    // Add RCA blocks if available
    if (payload.rca) {
      blocks.push(...this.buildRCABlocks(payload.rca));
    }

    // Action buttons
    const actionButtons: SlackButton[] = [];

    if (payload.rca?.detailUrl) {
      actionButtons.push({
        type: "button",
        text: { type: "plain_text", text: "📊 View Full RCA", emoji: true },
        url: payload.rca.detailUrl,
        style: "primary",
        action_id: "view_rca",
      });
    }

    if (payload.dashboardUrl) {
      actionButtons.push({
        type: "button",
        text: { type: "plain_text", text: "📈 Dashboard", emoji: true },
        url: payload.dashboardUrl,
        action_id: "view_dashboard",
      });
    }

    if (actionButtons.length > 0) {
      blocks.push({ type: "divider" });
      blocks.push({
        type: "actions",
        elements: actionButtons,
      });
    }

    // Footer context
    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: payload.rca
            ? "🤖 AI-Powered Root Cause Analysis by CognObserve"
            : "Sent by CognObserve Alerting",
        },
      ],
    });

    return blocks;
  }

  /**
   * Build RCA-specific blocks
   */
  private buildRCABlocks(rca: RCASummary): SlackBlock[] {
    const blocks: SlackBlock[] = [];
    const categoryIcon = RCA_CATEGORY_ICONS[rca.category];
    const categoryLabel = RCA_CATEGORY_LABELS[rca.category];

    // Divider before RCA section
    blocks.push({ type: "divider" });

    // RCA Header
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*🔍 Root Cause Analysis*",
      },
    });

    // Hypothesis
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `> ${rca.hypothesis}`,
      },
    });

    // Confidence and Category
    blocks.push({
      type: "section",
      fields: [
        {
          type: "mrkdwn",
          text: `*Confidence*\n${formatConfidence(rca.confidence)}`,
        },
        {
          type: "mrkdwn",
          text: `*Category*\n${categoryIcon} ${categoryLabel}`,
        },
      ],
    });

    // Related Change (if available)
    if (rca.topChange) {
      const changeIcon = rca.topChange.type === "commit" ? "📝" : "🔀";
      const changeLabel =
        rca.topChange.type === "commit" ? "Commit" : "Pull Request";

      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*${changeIcon} Related ${changeLabel}*\n\`${rca.topChange.id.slice(0, 7)}\` - ${rca.topChange.summary}\n_by ${rca.topChange.author}_`,
        },
      });
    }

    // Recommended Actions
    if (rca.remediation.length > 0) {
      const remediationList = rca.remediation
        .map((r, i) => `${i + 1}. ${r}`)
        .join("\n");
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*🛠️ Recommended Actions*\n${remediationList}`,
        },
      });
    }

    return blocks;
  }
}
