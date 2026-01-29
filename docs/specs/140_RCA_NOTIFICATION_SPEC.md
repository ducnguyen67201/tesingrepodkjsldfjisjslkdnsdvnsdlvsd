# Engineering Specification: RCA in Alert Notifications

**Issue:** [#140](https://github.com/ducnguyen67201/Ducsigr/issues/140)
**Epic:** Automated RCA System (#127)
**Sprint:** 4
**Priority:** P0
**Points:** 5

---

## 1. Executive Summary

Extend existing notification adapters (Discord, Gmail, Slack) to include Root Cause Analysis (RCA) summary when available. This enables on-call engineers to receive actionable insights directly in their notifications without needing to navigate to the dashboard.

### Goals
- Enrich alert notifications with RCA hypothesis and confidence scores
- Maintain backward compatibility when RCA data is unavailable
- Provide deep links to full RCA analysis in dashboard
- Handle RCA generation failures gracefully

### Non-Goals
- Modifying RCA generation logic
- Adding new notification providers
- Real-time RCA updates after notification

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           NOTIFICATION FLOW WITH RCA                        │
└─────────────────────────────────────────────────────────────────────────────┘

┌────────────────┐     ┌─────────────────┐     ┌──────────────────────────────┐
│ Alert Workflow │────▶│ dispatchNotifi- │────▶│ Lookup AlertRCA by alertId   │
│   (Temporal)   │     │    cation       │     │ (most recent, if available)  │
└────────────────┘     └─────────────────┘     └──────────────────────────────┘
                                │                            │
                                │                            ▼
                                │                 ┌──────────────────────────┐
                                │                 │ Build AlertPayload with  │
                                │                 │ optional RCA enrichment  │
                                │                 └──────────────────────────┘
                                │                            │
                                ▼                            ▼
                    ┌───────────────────────────────────────────────────────┐
                    │              ADAPTER LAYER (Enhanced)                 │
                    ├───────────────────┬───────────────────┬───────────────┤
                    │   DiscordAdapter  │   GmailAdapter    │  SlackAdapter │
                    │   (embed fields)  │   (HTML sections) │   (blocks)    │
                    └───────────────────┴───────────────────┴───────────────┘
                              │                   │                 │
                              ▼                   ▼                 ▼
                    ┌─────────────────────────────────────────────────────┐
                    │              NOTIFICATION RECIPIENTS                │
                    │  Discord webhooks  │  Gmail SMTP  │  Slack webhooks │
                    └─────────────────────────────────────────────────────┘
```

---

## 3. Data Model Changes

### 3.1 AlertPayload Schema Extension

**File:** `packages/api/src/schemas/alerting.ts`

Add RCA-related fields to the `AlertPayloadSchema`:

```typescript
// ============================================================
// RCA NOTIFICATION PAYLOAD (new section)
// ============================================================

/**
 * Top change (commit/PR) related to the incident
 */
export const RCATopChangeSchema = z.object({
  /** Change identifier (SHA or PR number) */
  id: z.string(),
  /** Type of change */
  type: z.enum(["commit", "pr"]),
  /** Short description (commit message or PR title, truncated) */
  summary: z.string().max(100),
  /** Author name */
  author: z.string(),
  /** Relevance level */
  relevance: z.enum(["high", "medium", "low"]),
});
export type RCATopChange = z.infer<typeof RCATopChangeSchema>;

/**
 * RCA summary for alert notifications
 */
export const RCASummarySchema = z.object({
  /** One-sentence hypothesis */
  hypothesis: z.string(),
  /** Confidence score (0-1) */
  confidence: z.number().min(0).max(1),
  /** Root cause category */
  category: z.enum([
    "CODE_CHANGE",
    "INFRASTRUCTURE",
    "EXTERNAL_DEPENDENCY",
    "DATA_ISSUE",
    "CONFIGURATION",
    "UNKNOWN",
  ]),
  /** Top suspected change (optional) */
  topChange: RCATopChangeSchema.optional(),
  /** Immediate remediation steps (max 3) */
  remediation: z.array(z.string()).max(3),
  /** URL to full RCA detail page */
  detailUrl: z.string().url(),
});
export type RCASummary = z.infer<typeof RCASummarySchema>;

/**
 * Alert notification payload - sent to adapters
 * Extended with optional RCA data
 */
export const AlertPayloadSchema = z.object({
  alertId: z.string(),
  alertName: z.string(),
  projectId: z.string(),
  projectName: z.string(),
  type: AlertTypeSchema,
  threshold: z.number(),
  actualValue: z.number(),
  operator: AlertOperatorSchema,
  triggeredAt: z.string().datetime(),
  dashboardUrl: z.string().url().optional(),

  // NEW: Optional RCA enrichment
  rca: RCASummarySchema.optional(),
});
export type AlertPayload = z.infer<typeof AlertPayloadSchema>;
```

### 3.2 Helper Functions

Add formatting helpers for RCA display:

```typescript
/**
 * Format confidence as percentage with label
 */
export function formatConfidence(confidence: number): string {
  const pct = Math.round(confidence * 100);
  if (pct >= 80) return `${pct}% (High)`;
  if (pct >= 50) return `${pct}% (Medium)`;
  return `${pct}% (Low)`;
}

/**
 * Format category for display
 */
export const RCA_CATEGORY_LABELS: Record<RCASummary["category"], string> = {
  CODE_CHANGE: "Code Change",
  INFRASTRUCTURE: "Infrastructure",
  EXTERNAL_DEPENDENCY: "External Dependency",
  DATA_ISSUE: "Data Issue",
  CONFIGURATION: "Configuration",
  UNKNOWN: "Unknown",
};

/**
 * Get emoji for category
 */
export const RCA_CATEGORY_ICONS: Record<RCASummary["category"], string> = {
  CODE_CHANGE: "💻",
  INFRASTRUCTURE: "🏗️",
  EXTERNAL_DEPENDENCY: "🔗",
  DATA_ISSUE: "📊",
  CONFIGURATION: "⚙️",
  UNKNOWN: "❓",
};
```

---

## 4. Internal Router Changes

### 4.1 RCA Lookup in dispatchNotification

**File:** `packages/api/src/routers/internal.ts`

Modify `dispatchNotification` to fetch and attach RCA data:

```typescript
/**
 * Dispatch notification for an alert
 * Enhanced with RCA lookup
 */
dispatchNotification: internalProcedure
  .input(z.object({
    alertId: z.string(),
    state: z.string(),
    value: z.number(),
    threshold: z.number(),
  }))
  .mutation(async ({ input }) => {
    const { alertId, state, value, threshold } = input;

    const alert = await prisma.alert.findUnique({
      where: { id: alertId },
      include: {
        project: {
          include: { workspace: true },
        },
        channelLinks: {
          include: { channel: true },
        },
      },
    });

    if (!alert) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Alert not found" });
    }

    if (alert.channelLinks.length === 0) {
      console.log(`[Internal:dispatchNotification] No channels configured`);
      return { channelCount: 0, sentCount: 0, failedCount: 0 };
    }

    // NEW: Lookup most recent RCA for this alert (if available)
    const rcaData = await lookupRecentRCA(alertId, alert.project.workspace.slug, alert.projectId);

    // Build alert payload with optional RCA
    const payload: AlertPayload = {
      alertId: alert.id,
      alertName: alert.name,
      projectId: alert.projectId,
      projectName: alert.project.name,
      type: alert.type as AlertPayload["type"],
      threshold: alert.threshold,
      actualValue: value,
      operator: alert.operator as AlertPayload["operator"],
      triggeredAt: new Date().toISOString(),
      dashboardUrl: buildDashboardUrl(alert.project.workspace.slug, alert.projectId),
      rca: rcaData, // May be undefined
    };

    // ... rest of dispatch logic unchanged
  }),
```

### 4.2 RCA Lookup Helper

```typescript
/**
 * Lookup most recent RCA for an alert within reasonable time window
 * Returns undefined if no RCA available or too old
 */
async function lookupRecentRCA(
  alertId: string,
  workspaceSlug: string,
  projectId: string
): Promise<RCASummary | undefined> {
  const MAX_RCA_AGE_MS = 5 * 60 * 1000; // 5 minutes

  try {
    const alertRCA = await prisma.alertRCA.findFirst({
      where: {
        alertId,
        createdAt: { gte: new Date(Date.now() - MAX_RCA_AGE_MS) },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!alertRCA) {
      console.log(`[Internal:lookupRecentRCA] No recent RCA for alert ${alertId}`);
      return undefined;
    }

    // Parse analysisJson (stored LLMRCAOutput)
    const analysis = alertRCA.analysisJson as LLMRCAOutput;

    // Extract top suspected change
    let topChange: RCATopChange | undefined;
    if (analysis.relatedChanges?.length > 0) {
      const top = analysis.relatedChanges[0];
      topChange = {
        id: top.changeId,
        type: top.type,
        summary: top.explanation.slice(0, 100),
        author: "Unknown", // Would need to join with GitCommit/GitPullRequest
        relevance: top.relevance,
      };
    }

    return {
      hypothesis: analysis.hypothesis,
      confidence: analysis.confidence,
      category: analysis.rootCause.category,
      topChange,
      remediation: analysis.remediation.immediate.slice(0, 3),
      detailUrl: `${process.env.NEXT_PUBLIC_APP_URL}/${workspaceSlug}/${projectId}/alerts/${alertId}/rca/${alertRCA.id}`,
    };
  } catch (error) {
    console.error(`[Internal:lookupRecentRCA] Error fetching RCA:`, error);
    return undefined;
  }
}

/**
 * Build dashboard URL for alert
 */
function buildDashboardUrl(workspaceSlug: string, projectId: string): string {
  return `${process.env.NEXT_PUBLIC_APP_URL}/${workspaceSlug}/${projectId}/dashboard`;
}
```

---

## 5. Discord Adapter Enhancement

**File:** `packages/api/src/lib/alerting/adapters/discord.ts`

### 5.1 Enhanced Embed Builder

```typescript
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
} from "../../../schemas/alerting";

/**
 * Build Discord embed object with optional RCA sections
 */
private buildEmbed(payload: AlertPayload): DiscordEmbed {
  const typeLabel = ALERT_TYPE_LABELS[payload.type];
  const operatorSymbol = getOperatorSymbol(payload.operator);
  const valueFormatted = formatAlertValue(payload.type, payload.actualValue);
  const thresholdFormatted = formatAlertValue(payload.type, payload.threshold);
  const color = this.getColor(payload.type);

  // Base fields (existing)
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

  // NEW: Add RCA fields if available
  if (payload.rca) {
    const { rca } = payload;
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
      fields.push({
        name: "🛠️ Recommended Actions",
        value: rca.remediation.map((r, i) => `${i + 1}. ${r}`).join("\n"),
        inline: false,
      });
    }

    // Full analysis link
    fields.push({
      name: "📊 Full Analysis",
      value: `[View Complete RCA](${rca.detailUrl})`,
      inline: false,
    });
  }

  // Dashboard link (if available)
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
        ? "Ducsigr • AI-Powered Root Cause Analysis"
        : "Ducsigr Alerting",
    },
  };
}
```

---

## 6. Gmail Adapter Enhancement

**File:** `packages/api/src/lib/alerting/adapters/gmail.ts`

### 6.1 Enhanced HTML Template

```typescript
/**
 * Build HTML email body with RCA section
 */
private buildEmailHtml(payload: AlertPayload): string {
  const typeLabel = ALERT_TYPE_LABELS[payload.type];
  const operatorSymbol = getOperatorSymbol(payload.operator);
  const valueFormatted = formatAlertValue(payload.type, payload.actualValue);
  const thresholdFormatted = formatAlertValue(payload.type, payload.threshold);

  // Build RCA section HTML if available
  const rcaSection = payload.rca ? this.buildRCAHtmlSection(payload.rca) : "";

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #dc2626; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
    .header h1 { margin: 0; font-size: 20px; }
    .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none; }
    .metric-box { background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin: 16px 0; }
    .metric-label { color: #6b7280; font-size: 14px; margin-bottom: 4px; }
    .metric-value { font-size: 32px; font-weight: bold; color: #dc2626; }
    .threshold { color: #6b7280; font-size: 14px; }
    .details { margin-top: 20px; }
    .details-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
    .details-label { color: #6b7280; }

    /* RCA Styles */
    .rca-section { background: #fefce8; border: 1px solid #fef08a; border-radius: 8px; padding: 20px; margin-top: 20px; }
    .rca-header { font-size: 18px; font-weight: 600; color: #854d0e; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
    .rca-hypothesis { font-size: 16px; color: #1f2937; margin-bottom: 16px; padding: 12px; background: white; border-radius: 6px; border-left: 4px solid #eab308; }
    .rca-meta { display: flex; gap: 20px; margin-bottom: 16px; }
    .rca-meta-item { display: flex; flex-direction: column; }
    .rca-meta-label { font-size: 12px; color: #6b7280; text-transform: uppercase; }
    .rca-meta-value { font-size: 14px; font-weight: 500; color: #1f2937; }
    .rca-change { background: white; border: 1px solid #e5e7eb; border-radius: 6px; padding: 12px; margin-bottom: 16px; }
    .rca-change-header { font-size: 14px; color: #6b7280; margin-bottom: 4px; }
    .rca-change-content { font-family: 'Monaco', 'Menlo', monospace; font-size: 13px; }
    .rca-remediation { margin-top: 16px; }
    .rca-remediation-header { font-size: 14px; font-weight: 600; color: #1f2937; margin-bottom: 8px; }
    .rca-remediation-list { margin: 0; padding-left: 20px; }
    .rca-remediation-list li { margin-bottom: 4px; }

    .footer { text-align: center; padding: 20px; color: #9ca3af; font-size: 12px; }
    .button { display: inline-block; background: #eab308; color: #1f2937; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500; margin-top: 16px; }
    .button-secondary { display: inline-block; background: #f3f4f6; color: #374151; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: 500; margin-left: 8px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>⚠️ Alert Triggered: ${payload.alertName}</h1>
    </div>
    <div class="content">
      <div class="metric-box">
        <div class="metric-label">${typeLabel}</div>
        <div class="metric-value">${valueFormatted}</div>
        <div class="threshold">Threshold: ${operatorSymbol} ${thresholdFormatted}</div>
      </div>

      <div class="details">
        <div class="details-row">
          <span class="details-label">Project</span>
          <span>${payload.projectName}</span>
        </div>
        <div class="details-row">
          <span class="details-label">Alert Type</span>
          <span>${typeLabel}</span>
        </div>
        <div class="details-row">
          <span class="details-label">Triggered At</span>
          <span>${new Date(payload.triggeredAt).toLocaleString()}</span>
        </div>
      </div>

      ${rcaSection}

      <div style="text-align: center; margin-top: 24px;">
        ${payload.rca
          ? `<a href="${payload.rca.detailUrl}" class="button">View Full RCA</a>
             <a href="${payload.dashboardUrl}" class="button-secondary">Dashboard</a>`
          : payload.dashboardUrl
            ? `<a href="${payload.dashboardUrl}" class="button">View Dashboard</a>`
            : ""
        }
      </div>
    </div>
    <div class="footer">
      <p>${payload.rca ? "🤖 AI-Powered Root Cause Analysis by Ducsigr" : "This alert was sent by Ducsigr"}</p>
      <p>Manage your alerts in project settings</p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Build RCA HTML section for email
 */
private buildRCAHtmlSection(rca: RCASummary): string {
  const categoryIcon = RCA_CATEGORY_ICONS[rca.category];
  const categoryLabel = RCA_CATEGORY_LABELS[rca.category];
  const confidencePct = Math.round(rca.confidence * 100);

  let changeHtml = "";
  if (rca.topChange) {
    const changeType = rca.topChange.type === "commit" ? "Related Commit" : "Related Pull Request";
    changeHtml = `
      <div class="rca-change">
        <div class="rca-change-header">📝 ${changeType}</div>
        <div class="rca-change-content">
          <code>${rca.topChange.id.slice(0, 7)}</code> - ${rca.topChange.summary}
          <br><small>by ${rca.topChange.author}</small>
        </div>
      </div>
    `;
  }

  let remediationHtml = "";
  if (rca.remediation.length > 0) {
    remediationHtml = `
      <div class="rca-remediation">
        <div class="rca-remediation-header">🛠️ Recommended Actions</div>
        <ol class="rca-remediation-list">
          ${rca.remediation.map(r => `<li>${r}</li>`).join("")}
        </ol>
      </div>
    `;
  }

  return `
    <div class="rca-section">
      <div class="rca-header">
        🔍 Root Cause Analysis
      </div>
      <div class="rca-hypothesis">${rca.hypothesis}</div>
      <div class="rca-meta">
        <div class="rca-meta-item">
          <span class="rca-meta-label">Confidence</span>
          <span class="rca-meta-value">${confidencePct}%</span>
        </div>
        <div class="rca-meta-item">
          <span class="rca-meta-label">Category</span>
          <span class="rca-meta-value">${categoryIcon} ${categoryLabel}</span>
        </div>
      </div>
      ${changeHtml}
      ${remediationHtml}
    </div>
  `;
}

/**
 * Build plain text email body with RCA section
 */
private buildEmailText(payload: AlertPayload): string {
  const typeLabel = ALERT_TYPE_LABELS[payload.type];
  const operatorSymbol = getOperatorSymbol(payload.operator);
  const valueFormatted = formatAlertValue(payload.type, payload.actualValue);
  const thresholdFormatted = formatAlertValue(payload.type, payload.threshold);

  let rcaText = "";
  if (payload.rca) {
    const { rca } = payload;
    rcaText = `

═══════════════════════════════════════════
🔍 ROOT CAUSE ANALYSIS
═══════════════════════════════════════════

Hypothesis: ${rca.hypothesis}

Confidence: ${Math.round(rca.confidence * 100)}%
Category: ${RCA_CATEGORY_LABELS[rca.category]}
${rca.topChange ? `
Related ${rca.topChange.type === "commit" ? "Commit" : "PR"}: ${rca.topChange.id.slice(0, 7)}
  ${rca.topChange.summary}
  by ${rca.topChange.author}
` : ""}
${rca.remediation.length > 0 ? `
Recommended Actions:
${rca.remediation.map((r, i) => `  ${i + 1}. ${r}`).join("\n")}
` : ""}
Full Analysis: ${rca.detailUrl}`;
  }

  return `
ALERT TRIGGERED: ${payload.alertName}

${typeLabel}: ${valueFormatted}
Threshold: ${operatorSymbol} ${thresholdFormatted}

Project: ${payload.projectName}
Triggered At: ${new Date(payload.triggeredAt).toLocaleString()}
${rcaText}
${payload.dashboardUrl ? `Dashboard: ${payload.dashboardUrl}` : ""}

---
${payload.rca ? "🤖 AI-Powered Root Cause Analysis by Ducsigr" : "This alert was sent by Ducsigr"}
  `.trim();
}
```

---

## 7. Slack Adapter Implementation

**File:** `packages/api/src/lib/alerting/adapters/slack.ts` (NEW)

### 7.1 Full Implementation

```typescript
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
  RCASummary,
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
  elements: Array<{ type: "mrkdwn"; text: string } | { type: "image"; image_url: string; alt_text: string }>;
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
        return this.createErrorResult(
          `Slack API error: ${response.status} - ${text}`
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
      text: { type: "plain_text", text: `🚨 Alert: ${payload.alertName}`, emoji: true },
    });

    // Alert details section
    blocks.push({
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*${typeLabel}*\n${valueFormatted}` },
        { type: "mrkdwn", text: `*Threshold*\n${operatorSymbol} ${thresholdFormatted}` },
        { type: "mrkdwn", text: `*Project*\n${payload.projectName}` },
        { type: "mrkdwn", text: `*Triggered*\n${new Date(payload.triggeredAt).toLocaleString()}` },
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
            ? "🤖 AI-Powered Root Cause Analysis by Ducsigr"
            : "Sent by Ducsigr Alerting",
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
        { type: "mrkdwn", text: `*Confidence*\n${formatConfidence(rca.confidence)}` },
        { type: "mrkdwn", text: `*Category*\n${categoryIcon} ${categoryLabel}` },
      ],
    });

    // Related Change (if available)
    if (rca.topChange) {
      const changeIcon = rca.topChange.type === "commit" ? "📝" : "🔀";
      const changeLabel = rca.topChange.type === "commit" ? "Commit" : "Pull Request";

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
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*🛠️ Recommended Actions*\n${rca.remediation.map((r, i) => `${i + 1}. ${r}`).join("\n")}`,
        },
      });
    }

    return blocks;
  }
}
```

### 7.2 Register Slack Adapter

**File:** `packages/api/src/lib/alerting/registry.ts`

```typescript
import { DiscordAdapter } from "./adapters/discord";
import { GmailAdapter } from "./adapters/gmail";
import { SlackAdapter } from "./adapters/slack";  // NEW
import type { IAlertingAdapter } from "./adapter";
import type { ChannelProvider } from "../../schemas/alerting";

/**
 * Adapter Registry - singleton map of provider to adapter
 */
class AdapterRegistryClass {
  private adapters = new Map<ChannelProvider, IAlertingAdapter>();

  constructor() {
    // Register built-in adapters
    this.register(new DiscordAdapter());
    this.register(new GmailAdapter());
    this.register(new SlackAdapter());  // NEW
  }

  register(adapter: IAlertingAdapter): void {
    this.adapters.set(adapter.provider, adapter);
  }

  get(provider: ChannelProvider): IAlertingAdapter {
    const adapter = this.adapters.get(provider);
    if (!adapter) {
      throw new Error(`No adapter registered for provider: ${provider}`);
    }
    return adapter;
  }

  has(provider: ChannelProvider): boolean {
    return this.adapters.has(provider);
  }
}

export const AdapterRegistry = new AdapterRegistryClass();
```

---

## 8. Error Handling & Graceful Degradation

### 8.1 RCA Lookup Failures

If RCA lookup fails or times out, notifications proceed without RCA data:

```typescript
async function lookupRecentRCA(
  alertId: string,
  workspaceSlug: string,
  projectId: string
): Promise<RCASummary | undefined> {
  try {
    // ... lookup logic
  } catch (error) {
    // Log error but don't fail notification
    console.error(`[Internal:lookupRecentRCA] Error fetching RCA:`, error);
    return undefined; // Graceful degradation
  }
}
```

### 8.2 Adapter Error Handling

Each adapter handles RCA rendering errors gracefully:

```typescript
private buildEmbed(payload: AlertPayload): DiscordEmbed {
  // ... base fields

  // Safe RCA rendering
  if (payload.rca) {
    try {
      fields.push(...this.buildRCAFields(payload.rca));
    } catch (error) {
      console.error(`[DiscordAdapter] Error rendering RCA:`, error);
      // Add fallback field
      fields.push({
        name: "🔍 Root Cause Analysis",
        value: "RCA available - [View in Dashboard]",
        inline: false,
      });
    }
  }
}
```

---

## 9. Testing Strategy

### 9.1 Unit Tests

**File:** `packages/api/src/lib/alerting/adapters/discord.test.ts`

```typescript
describe("DiscordAdapter", () => {
  describe("buildEmbed", () => {
    it("should build basic embed without RCA", () => {
      const payload = createMockAlertPayload();
      const embed = adapter["buildEmbed"](payload);

      expect(embed.fields.length).toBe(3); // type, threshold, project
      expect(embed.fields.find(f => f.name.includes("RCA"))).toBeUndefined();
    });

    it("should include RCA fields when available", () => {
      const payload = createMockAlertPayload({
        rca: createMockRCASummary(),
      });
      const embed = adapter["buildEmbed"](payload);

      expect(embed.fields.find(f => f.name === "🔍 Root Cause Analysis")).toBeDefined();
      expect(embed.fields.find(f => f.name === "Confidence")).toBeDefined();
      expect(embed.fields.find(f => f.name === "Category")).toBeDefined();
    });

    it("should include related change when available", () => {
      const payload = createMockAlertPayload({
        rca: createMockRCASummary({
          topChange: { id: "abc123", type: "commit", summary: "Fix bug", author: "dev", relevance: "high" },
        }),
      });
      const embed = adapter["buildEmbed"](payload);

      expect(embed.fields.find(f => f.name.includes("Related Commit"))).toBeDefined();
    });
  });
});
```

### 9.2 Integration Tests

**File:** `packages/api/src/routers/internal.test.ts`

```typescript
describe("dispatchNotification with RCA", () => {
  it("should include RCA in payload when available", async () => {
    // Create alert and AlertRCA
    const alert = await createTestAlert();
    await createTestAlertRCA(alert.id);

    // Mock adapter
    const mockSend = vi.fn().mockResolvedValue({ success: true, provider: "DISCORD" });
    vi.spyOn(AdapterRegistry, "get").mockReturnValue({ send: mockSend } as any);

    // Dispatch
    await caller.internal.dispatchNotification({
      alertId: alert.id,
      state: "FIRING",
      value: 10,
      threshold: 5,
    });

    // Verify RCA was included
    expect(mockSend).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        rca: expect.objectContaining({
          hypothesis: expect.any(String),
          confidence: expect.any(Number),
        }),
      })
    );
  });

  it("should proceed without RCA when not available", async () => {
    const alert = await createTestAlert();
    // No AlertRCA created

    const mockSend = vi.fn().mockResolvedValue({ success: true, provider: "DISCORD" });
    vi.spyOn(AdapterRegistry, "get").mockReturnValue({ send: mockSend } as any);

    await caller.internal.dispatchNotification({
      alertId: alert.id,
      state: "FIRING",
      value: 10,
      threshold: 5,
    });

    expect(mockSend).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        rca: undefined,
      })
    );
  });
});
```

---

## 10. Files to Modify

| File | Change Type | Description |
|------|-------------|-------------|
| `packages/api/src/schemas/alerting.ts` | Modify | Add RCASummary schema, extend AlertPayload |
| `packages/api/src/routers/internal.ts` | Modify | Add RCA lookup to dispatchNotification |
| `packages/api/src/lib/alerting/adapters/discord.ts` | Modify | Add RCA embed sections |
| `packages/api/src/lib/alerting/adapters/gmail.ts` | Modify | Add RCA HTML/text sections |
| `packages/api/src/lib/alerting/adapters/slack.ts` | Create | New Slack adapter with Block Kit |
| `packages/api/src/lib/alerting/registry.ts` | Modify | Register SlackAdapter |
| `packages/api/src/lib/alerting/adapters/index.ts` | Modify | Export SlackAdapter |

---

## 11. Acceptance Criteria Checklist

- [ ] Discord embeds display RCA hypothesis and confidence scores
- [ ] Gmail messages include formatted RCA sections
- [ ] Slack messages contain RCA blocks with Block Kit
- [ ] Notifications function correctly when RCA is unavailable
- [ ] Dashboard links accompany RCA data in notifications
- [ ] All adapter tests pass
- [ ] Integration tests verify RCA enrichment flow

---

## 12. Dependencies

- **Prerequisite:** #139 (RCA Storage and Schema) must be completed
- **External:** None (uses existing webhook/SMTP infrastructure)

---

## 13. Rollout Plan

1. **Phase 1:** Deploy schema changes (backward compatible)
2. **Phase 2:** Deploy internal router RCA lookup
3. **Phase 3:** Deploy adapter enhancements (Discord, Gmail, Slack)
4. **Phase 4:** Monitor notification delivery and error rates

---

## 14. Architectural Decisions

### 14.1 RCA Confidence Threshold

**Decision:** Suppress RCA from notifications when confidence < 30%

**Rationale:**
- Low confidence RCA can mislead engineers and erode trust
- Users can still access full RCA via dashboard link
- Threshold can be configured per workspace in future iterations

**Implementation:**
```typescript
// In lookupRecentRCA
const MIN_RCA_CONFIDENCE = 0.30;

if (alertRCA.confidence && alertRCA.confidence < MIN_RCA_CONFIDENCE) {
  console.log(`[Internal:lookupRecentRCA] RCA confidence ${alertRCA.confidence} below threshold`);
  return undefined;
}
```

### 14.2 RCA Lookup Strategy

**Decision:** Synchronous lookup with timeout, no caching

**Rationale:**
- RCA data is already stored in PostgreSQL (fast lookup)
- Caching adds complexity without significant benefit
- 5-minute recency window prevents stale data

**Performance Considerations:**
- Query indexed on `alertId` + `createdAt DESC`
- Single query with `findFirst` (no join overhead)
- Expected latency: < 10ms for indexed lookup

### 14.3 Notification Flow Timing

**Decision:** RCA lookup happens within `dispatchNotification`, not in workflow

**Rationale:**
- Keeps workflow simpler (no RCA awareness needed)
- Allows RCA to be available even if generated after alert fires
- Single point of RCA enrichment logic

**Alternative Considered:** Pass RCA from workflow → activity → tRPC
- Rejected: Couples workflow to RCA generation timing
- Rejected: Requires workflow changes for RCA feature

---

## 15. Performance Analysis

### 15.1 Notification Latency Budget

| Stage | Target | Worst Case |
|-------|--------|------------|
| RCA Lookup | 10ms | 50ms |
| Payload Construction | 2ms | 5ms |
| Discord Webhook | 200ms | 2000ms |
| Gmail SMTP | 500ms | 3000ms |
| Slack Webhook | 200ms | 2000ms |
| **Total (parallel)** | **700ms** | **3000ms** |

### 15.2 Database Query Optimization

```sql
-- Ensure proper indexing for RCA lookup
CREATE INDEX CONCURRENTLY idx_alert_rca_alert_created
ON alert_rcas (alert_id, created_at DESC);
```

### 15.3 Connection Pooling

External webhook calls should use connection pooling:
```typescript
// Consider using undici for better HTTP/2 support
import { fetch as undiciFetch, Agent } from "undici";

const agent = new Agent({
  keepAliveTimeout: 10_000,
  keepAliveMaxTimeout: 30_000,
});
```

---

## 16. Security Considerations

### 16.1 Webhook URL Validation

Webhook URLs are already validated at input time via Zod schemas. Additional runtime checks:

```typescript
// Prevent SSRF attacks
const BLOCKED_HOSTS = ["localhost", "127.0.0.1", "::1", "169.254.169.254"];

function validateWebhookUrl(url: string): boolean {
  const parsed = new URL(url);
  if (BLOCKED_HOSTS.includes(parsed.hostname)) {
    throw new Error("Invalid webhook host");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("HTTPS required for webhooks");
  }
  return true;
}
```

### 16.2 RCA Data Sanitization

Ensure user-generated content in RCA doesn't contain XSS payloads:

```typescript
// HTML email sanitization
private escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Discord/Slack markdown sanitization
private escapeMarkdown(text: string): string {
  return text.replace(/[*_~`|]/g, "\\$&");
}
```

### 16.3 Rate Limiting

Implement per-alert rate limiting to prevent notification spam:

```typescript
const NOTIFICATION_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

async function shouldSendNotification(alertId: string): Promise<boolean> {
  const lastNotification = await redis.get(`notification:${alertId}:last`);
  if (lastNotification) {
    const elapsed = Date.now() - parseInt(lastNotification, 10);
    if (elapsed < NOTIFICATION_COOLDOWN_MS) {
      return false;
    }
  }
  await redis.set(`notification:${alertId}:last`, Date.now().toString());
  return true;
}
```

---

## 17. Monitoring & Observability

### 17.1 Metrics to Track

| Metric | Type | Labels |
|--------|------|--------|
| `notification_sent_total` | Counter | `provider`, `has_rca`, `status` |
| `notification_latency_ms` | Histogram | `provider`, `has_rca` |
| `rca_lookup_latency_ms` | Histogram | `found` |
| `rca_confidence_distribution` | Histogram | - |

### 17.2 Logging Standards

```typescript
// Structured logging for notification dispatch
console.log(JSON.stringify({
  event: "notification_dispatched",
  alertId,
  provider: channel.provider,
  hasRCA: !!payload.rca,
  rcaConfidence: payload.rca?.confidence,
  latencyMs: Date.now() - startTime,
  success: result.success,
  error: result.error,
}));
```

### 17.3 Alerting on Notification Failures

Create internal alert for notification system health:
- Trigger if > 10% of notifications fail within 5 minutes
- Trigger if average latency exceeds 2 seconds

---

## 18. Migration & Rollback

### 18.1 Feature Flag

```typescript
// packages/shared/src/feature-flags.ts
export const FEATURE_FLAGS = {
  RCA_IN_NOTIFICATIONS: "rca_in_notifications",
} as const;

// In dispatchNotification
const rcaEnabled = await isFeatureEnabled(
  FEATURE_FLAGS.RCA_IN_NOTIFICATIONS,
  { projectId: alert.projectId }
);

const rcaData = rcaEnabled
  ? await lookupRecentRCA(alertId, workspaceSlug, projectId)
  : undefined;
```

### 18.2 Rollback Procedure

1. **Immediate:** Disable feature flag via admin panel
2. **Short-term:** Deploy previous adapter versions
3. **Database:** No schema rollback needed (additive changes only)

### 18.3 Canary Deployment

1. Enable for 1% of projects (randomized)
2. Monitor error rates and latency
3. Increase to 10%, 50%, 100% over 1 week

---

## 19. Future Enhancements

### 19.1 RCA Streaming (v2)

For real-time RCA updates as analysis progresses:
```
Alert fires → Send initial notification → RCA completes → Update notification (Slack/Discord only)
```

### 19.2 Custom RCA Templates (v2)

Allow workspaces to customize RCA presentation:
- Custom field ordering
- Optional sections (remediation, code changes)
- Branding customization for email

### 19.3 Multi-language Support (v3)

Localized notification templates based on user preferences.

---

## 20. Open Questions (Resolved)

| Question | Resolution |
|----------|------------|
| Should RCA confidence < 30% be suppressed? | **Yes** - implement threshold |
| Should we rate limit RCA lookups? | **No** - single indexed query is fast enough |
| Should we cache RCA in payload? | **Yes** - for audit trail in AlertHistory |

---

## 21. Appendix: Visual Examples

### 21.1 Discord Notification with RCA

```
┌─────────────────────────────────────────────────────────────────┐
│ 🚨 Alert: High Error Rate                                        │
├─────────────────────────────────────────────────────────────────┤
│ Alert triggered for **Production API**                           │
│                                                                  │
│ Error Rate          Threshold           Project                  │
│ **15.50%**          > 5.00%             Production API           │
│ ───────────────                                                  │
│                                                                  │
│ 🔍 Root Cause Analysis                                           │
│ The error spike correlates with deployment abc1234 which         │
│ introduced a null pointer exception in the auth middleware.      │
│                                                                  │
│ Confidence          Category                                     │
│ 78% (High)          💻 Code Change                               │
│                                                                  │
│ 📝 Related Commit                                                │
│ `abc1234` - Fix auth middleware validation                       │
│ by jane@example.com                                              │
│                                                                  │
│ 🛠️ Recommended Actions                                           │
│ 1. Rollback deployment abc1234                                   │
│ 2. Add null check in AuthMiddleware.validate()                   │
│ 3. Add integration test for auth edge cases                      │
│                                                                  │
│ 📊 Full Analysis                                                 │
│ [View Complete RCA](https://app.ducsigr.io/...)              │
├─────────────────────────────────────────────────────────────────┤
│ 🤖 AI-Powered Root Cause Analysis by Ducsigr                │
└─────────────────────────────────────────────────────────────────┘
```

### 21.2 Slack Notification with RCA

```
┌─────────────────────────────────────────────────────────────────┐
│ 🚨 Alert: High Error Rate                                        │
├─────────────────────────────────────────────────────────────────┤
│ Error Rate    Threshold      Project         Triggered           │
│ 15.50%        > 5.00%        Production API  Dec 14, 2:34 PM     │
├─────────────────────────────────────────────────────────────────┤
│ *🔍 Root Cause Analysis*                                         │
│                                                                  │
│ > The error spike correlates with deployment abc1234 which       │
│ > introduced a null pointer exception in the auth middleware.    │
│                                                                  │
│ Confidence           Category                                    │
│ 78% (High)           💻 Code Change                              │
│                                                                  │
│ *📝 Related Commit*                                              │
│ `abc1234` - Fix auth middleware validation                       │
│ _by jane@example.com_                                            │
│                                                                  │
│ *🛠️ Recommended Actions*                                         │
│ 1. Rollback deployment abc1234                                   │
│ 2. Add null check in AuthMiddleware.validate()                   │
│ 3. Add integration test for auth edge cases                      │
├─────────────────────────────────────────────────────────────────┤
│ [📊 View Full RCA]  [📈 Dashboard]                               │
├─────────────────────────────────────────────────────────────────┤
│ 🤖 AI-Powered Root Cause Analysis by Ducsigr                │
└─────────────────────────────────────────────────────────────────┘
```

---

## 22. Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2024-12-14 | Initial | Initial specification |
| 1.1 | 2024-12-14 | Senior Architect | Added architectural decisions, performance analysis, security considerations, monitoring, migration strategy |
