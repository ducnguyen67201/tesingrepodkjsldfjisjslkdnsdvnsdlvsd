# Alerting System - Best Practices & Configuration Guide

## Overview

This document outlines best practices for configuring alerts in Ducsigr, based on industry standards and observability research.

## Cooldown Time Recommendations

Cooldown prevents alert spam by enforcing a minimum time between repeated notifications for the same alert.

| Alert Severity | Recommended Cooldown | Use Case |
|---------------|---------------------|----------|
| **Critical (P1)** | 5-15 minutes | System down, data loss, security breach |
| **High (P2)** | 30-60 minutes | Service degradation, high error rates |
| **Medium (P3)** | 2-4 hours | Performance issues, elevated latency |
| **Low (P4)** | 12-24 hours | Warnings, capacity planning |

### Cooldown Formula

```typescript
cooldownMs = cooldownMins * 60 * 1000
// Example: 60 minutes = 60 * 60 * 1000 = 3,600,000ms
```

## Threshold Recommendations

### Error Rate Thresholds

| Level | Threshold | Description |
|-------|-----------|-------------|
| Warning | > 1% | Early indicator of issues |
| Critical | > 5% | Significant impact on users |
| Severe | > 10% | Major incident |

### Latency Thresholds

| Metric | Warning | Critical | Notes |
|--------|---------|----------|-------|
| **P50 (Median)** | > 200ms | > 500ms | Typical user experience |
| **P95** | > 500ms | > 1000ms | 95% of requests |
| **P99** | > 1000ms | > 3000ms | Tail latency |

## Preset Templates

### Aggressive (Development/Staging)
- Low thresholds for early detection
- Short cooldowns (5-15 min)
- Use when debugging or testing

### Balanced (Recommended for Production)
- Error Rate: > 5%
- Latency P95: > 1000ms
- Cooldown: 30-60 minutes

### Conservative (High-Traffic Production)
- Higher thresholds to reduce noise
- Longer cooldowns (2-4 hours)
- Focus on critical issues only

## Best Practices

### 1. Avoid Alert Fatigue
- Only alert on **actionable** issues
- If you can't act on it, don't alert on it
- Review and tune thresholds regularly

### 2. Use Duration Requirements
- Require condition to persist for 2-3 evaluation cycles
- Prevents alerting on transient spikes
- Current implementation: Alert evaluates every 10 seconds

### 3. Prioritize Alerts
- Not all alerts are equal
- Route critical alerts to PagerDuty/phone
- Route warnings to Slack/Discord

### 4. Test Alerts Regularly
- Verify alerts fire correctly
- Test notification channels monthly
- Document expected behavior

### 5. Create Runbooks
- Each alert should have a response procedure
- Document investigation steps
- Include escalation paths

## Current Implementation

### Alert Evaluation Interval
- Worker evaluates alerts every **10 seconds**
- Eligible alerts: enabled AND not in cooldown

### Supported Alert Types
- `ERROR_RATE` - Percentage of spans with ERROR level
- `LATENCY_P50` - 50th percentile latency
- `LATENCY_P95` - 95th percentile latency
- `LATENCY_P99` - 99th percentile latency

### Notification Channels
- Discord (webhook)
- Gmail (SMTP)
- Slack (webhook) - planned
- PagerDuty - planned
- Generic Webhook - planned

## Testing Alerts

### Send Test Trace (Postman)

```json
{
  "name": "test-trace",
  "spans": [
    {
      "name": "llm-call",
      "start_time": "2025-12-07T00:30:00.000Z",
      "end_time": "2025-12-07T00:31:00.000Z",
      "level": "ERROR"
    }
  ]
}
```

**Notes:**
- `start_time` and `end_time` must be within the alert window (e.g., last 5 minutes)
- Omit times to auto-default to current time (0ms latency)
- Use `level: "ERROR"` to trigger error rate alerts

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Worker    │────▶│   Web API   │────▶│  Channels   │
│ (Evaluates) │     │ (Sends)     │     │ (Discord,   │
└─────────────┘     └─────────────┘     │  Gmail...)  │
      │                   │             └─────────────┘
      │                   │
      ▼                   ▼
┌─────────────┐     ┌─────────────┐
│  Metrics    │     │   History   │
│  (Prisma)   │     │  (Prisma)   │
└─────────────┘     └─────────────┘
```

## References

- [Last9 - Observability Best Practices](https://last9.io/blog/observability-best-practices/)
- [Cloudflare - Minimizing On-Call Burnout](https://blog.cloudflare.com/alerts-observability/)
- [AWS Observability - Alarms Best Practices](https://aws-observability.github.io/observability-best-practices/signals/alarms/)
- [Frontegg - Tackling Alert Fatigue](https://frontegg.com/blog/tackling-alert-fatigue-a-journey-to-better-observability/)
- [VMware - Alerts Best Practices](https://docs.wavefront.com/alerts_best_practices.html)
