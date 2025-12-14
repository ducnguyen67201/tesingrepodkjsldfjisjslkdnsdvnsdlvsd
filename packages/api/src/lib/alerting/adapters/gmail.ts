/**
 * Gmail Adapter
 *
 * Gmail/SMTP adapter for sending alert notifications via email.
 */

import * as nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { BaseAlertingAdapter } from "../adapter";
import type { SendResult } from "../../../schemas/alerting";
import {
  AlertPayload,
  GmailConfigSchema,
  GmailConfig,
  ALERT_TYPE_LABELS,
  formatAlertValue,
  getOperatorSymbol,
  RCA_CATEGORY_LABELS,
  RCA_CATEGORY_ICONS,
  type RCASummary,
} from "../../../schemas/alerting";

// SMTP Configuration from environment
const SMTP_CONFIG = {
  host: process.env.SMTP_HOST ?? "smtp.gmail.com",
  port: parseInt(process.env.SMTP_PORT ?? "587", 10),
  user: process.env.SMTP_USER,
  pass: process.env.SMTP_PASS,
  from: process.env.SMTP_FROM,
};

/**
 * Gmail/SMTP adapter for sending alert notifications via email.
 *
 * @example
 * ```ts
 * const adapter = new GmailAdapter();
 * await adapter.send({ email: "user@example.com" }, payload);
 * ```
 */
export class GmailAdapter extends BaseAlertingAdapter {
  readonly provider = "GMAIL" as const;
  private transporter: Transporter | null = null;

  private getTransporter(): Transporter {
    if (!this.transporter) {
      if (!SMTP_CONFIG.user || !SMTP_CONFIG.pass) {
        throw new Error("SMTP credentials not configured");
      }

      this.transporter = nodemailer.createTransport({
        host: SMTP_CONFIG.host,
        port: SMTP_CONFIG.port,
        secure: SMTP_CONFIG.port === 465,
        auth: {
          user: SMTP_CONFIG.user,
          pass: SMTP_CONFIG.pass,
        },
      });
    }
    return this.transporter;
  }

  /**
   * Validate Gmail-specific configuration
   */
  validateConfig(config: unknown): GmailConfig {
    return GmailConfigSchema.parse(config);
  }

  /**
   * Send alert notification via email
   */
  async send(config: unknown, payload: AlertPayload): Promise<SendResult> {
    try {
      const validConfig = this.validateConfig(config);
      const transporter = this.getTransporter();

      const html = this.buildEmailHtml(payload);
      const text = this.buildEmailText(payload);

      const info = await transporter.sendMail({
        from: SMTP_CONFIG.from ?? SMTP_CONFIG.user,
        to: validConfig.email,
        subject: this.buildSubject(payload),
        text,
        html,
      });

      return this.createSuccessResult(info.messageId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return this.createErrorResult(message);
    }
  }

  /**
   * Build email subject line
   */
  private buildSubject(payload: AlertPayload): string {
    const icon = this.getAlertIcon(payload.type);
    return `${icon} Alert: ${payload.alertName} - ${payload.projectName}`;
  }

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

    // Build action buttons
    let actionButtons = "";
    if (payload.rca) {
      actionButtons = `
        <a href="${payload.rca.detailUrl}" class="button">View Full RCA</a>
        ${payload.dashboardUrl ? `<a href="${payload.dashboardUrl}" class="button-secondary">Dashboard</a>` : ""}
      `;
    } else if (payload.dashboardUrl) {
      actionButtons = `<a href="${payload.dashboardUrl}" class="button">View Dashboard</a>`;
    }

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
      <h1>Alert Triggered: ${this.escapeHtml(payload.alertName)}</h1>
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
          <span>${this.escapeHtml(payload.projectName)}</span>
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
        ${actionButtons}
      </div>
    </div>
    <div class="footer">
      <p>${payload.rca ? "🤖 AI-Powered Root Cause Analysis by CognObserve" : "This alert was sent by CognObserve"}</p>
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
            <code>${this.escapeHtml(rca.topChange.id.slice(0, 7))}</code> - ${this.escapeHtml(rca.topChange.summary)}
            <br><small>by ${this.escapeHtml(rca.topChange.author)}</small>
          </div>
        </div>
      `;
    }

    let remediationHtml = "";
    if (rca.remediation.length > 0) {
      const items = rca.remediation.map((r) => `<li>${this.escapeHtml(r)}</li>`).join("");
      remediationHtml = `
        <div class="rca-remediation">
          <div class="rca-remediation-header">🛠️ Recommended Actions</div>
          <ol class="rca-remediation-list">
            ${items}
          </ol>
        </div>
      `;
    }

    return `
      <div class="rca-section">
        <div class="rca-header">
          🔍 Root Cause Analysis
        </div>
        <div class="rca-hypothesis">${this.escapeHtml(rca.hypothesis)}</div>
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
   * Escape HTML special characters to prevent XSS
   */
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
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
      const categoryLabel = RCA_CATEGORY_LABELS[rca.category];

      let changeText = "";
      if (rca.topChange) {
        const changeType = rca.topChange.type === "commit" ? "Commit" : "PR";
        changeText = `
Related ${changeType}: ${rca.topChange.id.slice(0, 7)}
  ${rca.topChange.summary}
  by ${rca.topChange.author}
`;
      }

      let remediationText = "";
      if (rca.remediation.length > 0) {
        const items = rca.remediation.map((r, i) => `  ${i + 1}. ${r}`).join("\n");
        remediationText = `
Recommended Actions:
${items}
`;
      }

      rcaText = `

═══════════════════════════════════════════
🔍 ROOT CAUSE ANALYSIS
═══════════════════════════════════════════

Hypothesis: ${rca.hypothesis}

Confidence: ${Math.round(rca.confidence * 100)}%
Category: ${categoryLabel}
${changeText}${remediationText}
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
${payload.rca ? "🤖 AI-Powered Root Cause Analysis by CognObserve" : "This alert was sent by CognObserve"}
    `.trim();
  }

  /**
   * Get alert icon emoji
   */
  private getAlertIcon(type: AlertPayload["type"]): string {
    const icons: Record<AlertPayload["type"], string> = {
      ERROR_RATE: "🚨",
      LATENCY_P50: "⏱️",
      LATENCY_P95: "⏱️",
      LATENCY_P99: "⏱️",
    };
    return icons[type];
  }
}
