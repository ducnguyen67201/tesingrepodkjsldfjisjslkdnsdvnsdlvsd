/**
 * RCA Template Content
 *
 * Static content for template-based RCA fallback.
 */

import type { Remediation } from "../../temporal/types";

/** Generic remediation steps for template-based RCA */
export const TEMPLATE_REMEDIATION: Remediation = {
  immediate: [
    "Review recent deployments and consider rollback if issue persists",
    "Check application health dashboards for additional signals",
    "Monitor error rates over the next 30 minutes",
  ],
  longTerm: [
    "Add more granular monitoring for the affected endpoints",
    "Consider implementing circuit breakers for failing operations",
    "Review and improve test coverage for affected code paths",
  ],
};

/** Default reasoning for template-based RCA */
export const TEMPLATE_REASONING = {
  costOptimization:
    "Template-based analysis used for cost optimization on low-severity alert with minimal data.",
  errorFallback:
    "LLM analysis failed. This is a template-based analysis with limited insights.",
} as const;

/** Default confidence for template-based RCA */
export const TEMPLATE_CONFIDENCE = 0.3;
