# Sprint 4: Integration & Notifications - RCA in User Experience

**Sprint ID:** #127 Sprint 4
**Story Points:** 13
**Priority:** P0 (Stories 1-2), P2 (Story 3)
**Dependencies:** Sprint 3 (RCA Engine) completed

---

## Sprint Goal

> Users receive actionable RCA with alerts: Notifications include RCA summaries, dashboard shows full RCA details, and users can manually trigger re-analysis.

---

## Definition of Done

- [ ] Discord/Slack notifications include RCA summary
- [ ] Email notifications include RCA details
- [ ] RCA detail page in dashboard shows full analysis
- [ ] Manual RCA trigger button works for historical alerts
- [ ] User feedback (thumbs up/down) collected

---

## Stories

### Story 1: RCA in Alert Notifications

**Ticket ID:** #140
**Points:** 5
**Priority:** P0

#### Description

Extend existing notification adapters (Discord, Gmail, Slack) to include RCA summary when available. The RCA should be appended to the alert notification automatically.

#### Acceptance Criteria

- [ ] Discord embed includes RCA hypothesis and confidence
- [ ] Gmail email includes RCA section with formatting
- [ ] Slack message includes RCA block
- [ ] Notifications work even if RCA generation fails
- [ ] RCA link to dashboard included

#### Technical Details

**Updated Alert Payload:**
```typescript
// packages/api/src/schemas/alerting.ts

export const AlertPayloadSchema = z.object({
  alertId: z.string(),
  alertName: z.string(),
  projectId: z.string(),
  projectName: z.string(),
  type: AlertTypeSchema,
  threshold: z.number(),
  actualValue: z.number(),
  operator: AlertOperatorSchema,
  triggeredAt: z.string(),
  dashboardUrl: z.string().optional(),

  // NEW: RCA fields
  rca: z.object({
    hypothesis: z.string(),
    confidence: z.number(),
    category: z.enum(["code_change", "infrastructure", "external_dependency", "data_issue", "unknown"]),
    topChange: z.object({
      type: z.enum(["commit", "pr"]),
      title: z.string(),
      author: z.string(),
    }).optional(),
    remediation: z.array(z.string()),
    detailUrl: z.string(),
  }).optional(),
});
```

**Discord Adapter Update:**
```typescript
// packages/api/src/lib/alerting/adapters/discord.ts

private buildEmbed(payload: AlertPayload): DiscordEmbed {
  const fields: DiscordField[] = [
    { name: "Alert", value: payload.alertName, inline: true },
    { name: "Type", value: ALERT_TYPE_LABELS[payload.type], inline: true },
    { name: "Severity", value: this.getSeverityEmoji(payload), inline: true },
    { name: "Value", value: formatAlertValue(payload.type, payload.actualValue), inline: true },
    { name: "Threshold", value: `${getOperatorSymbol(payload.operator)} ${formatAlertValue(payload.type, payload.threshold)}`, inline: true },
    { name: "Project", value: payload.projectName, inline: true },
  ];

  // Add RCA section if available
  if (payload.rca) {
    fields.push({
      name: "🔍 Root Cause Analysis",
      value: `**Hypothesis:** ${payload.rca.hypothesis}\n**Confidence:** ${(payload.rca.confidence * 100).toFixed(0)}%`,
      inline: false,
    });

    if (payload.rca.topChange) {
      fields.push({
        name: "📝 Related Change",
        value: `${payload.rca.topChange.type === "commit" ? "Commit" : "PR"}: ${payload.rca.topChange.title}\nBy: ${payload.rca.topChange.author}`,
        inline: false,
      });
    }

    if (payload.rca.remediation.length > 0) {
      fields.push({
        name: "🛠️ Recommended Actions",
        value: payload.rca.remediation.slice(0, 3).map((r, i) => `${i + 1}. ${r}`).join("\n"),
        inline: false,
      });
    }

    fields.push({
      name: "📊 Full Analysis",
      value: `[View RCA Details](${payload.rca.detailUrl})`,
      inline: false,
    });
  }

  return {
    title: `🚨 Alert: ${payload.alertName}`,
    description: `Alert triggered at ${new Date(payload.triggeredAt).toLocaleString()}`,
    color: this.getColorForSeverity(payload),
    fields,
    timestamp: payload.triggeredAt,
    footer: {
      text: "Ducsigr Alerting",
    },
  };
}
```

**Gmail Adapter Update:**
```typescript
// packages/api/src/lib/alerting/adapters/gmail.ts

private buildHtmlBody(payload: AlertPayload): string {
  let rcaSection = "";

  if (payload.rca) {
    rcaSection = `
      <div style="margin-top: 24px; padding: 16px; background: #f8f9fa; border-radius: 8px;">
        <h3 style="margin: 0 0 12px 0; color: #1a1a1a;">🔍 Root Cause Analysis</h3>

        <p style="margin: 0 0 8px 0;">
          <strong>Hypothesis:</strong> ${escapeHtml(payload.rca.hypothesis)}
        </p>

        <p style="margin: 0 0 8px 0;">
          <strong>Confidence:</strong> ${(payload.rca.confidence * 100).toFixed(0)}%
          <span style="display: inline-block; width: 100px; height: 8px; background: #e0e0e0; border-radius: 4px; margin-left: 8px;">
            <span style="display: block; width: ${payload.rca.confidence * 100}%; height: 100%; background: ${this.getConfidenceColor(payload.rca.confidence)}; border-radius: 4px;"></span>
          </span>
        </p>

        ${payload.rca.topChange ? `
          <p style="margin: 0 0 8px 0;">
            <strong>Related Change:</strong> ${payload.rca.topChange.type === "commit" ? "Commit" : "PR"} by ${escapeHtml(payload.rca.topChange.author)}<br/>
            <em>${escapeHtml(payload.rca.topChange.title)}</em>
          </p>
        ` : ""}

        ${payload.rca.remediation.length > 0 ? `
          <div style="margin-top: 12px;">
            <strong>Recommended Actions:</strong>
            <ol style="margin: 8px 0 0 0; padding-left: 20px;">
              ${payload.rca.remediation.slice(0, 3).map(r => `<li>${escapeHtml(r)}</li>`).join("")}
            </ol>
          </div>
        ` : ""}

        <p style="margin: 16px 0 0 0;">
          <a href="${payload.rca.detailUrl}" style="color: #0066cc;">View Full RCA Report →</a>
        </p>
      </div>
    `;
  }

  return `
    <!DOCTYPE html>
    <html>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: ${this.getAlertColor(payload)}; color: white; padding: 16px; border-radius: 8px 8px 0 0;">
        <h2 style="margin: 0;">🚨 ${escapeHtml(payload.alertName)}</h2>
      </div>

      <div style="border: 1px solid #e0e0e0; border-top: none; padding: 16px; border-radius: 0 0 8px 8px;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0;"><strong>Type:</strong></td>
            <td style="padding: 8px 0;">${ALERT_TYPE_LABELS[payload.type]}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0;"><strong>Value:</strong></td>
            <td style="padding: 8px 0;">${formatAlertValue(payload.type, payload.actualValue)}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0;"><strong>Threshold:</strong></td>
            <td style="padding: 8px 0;">${getOperatorSymbol(payload.operator)} ${formatAlertValue(payload.type, payload.threshold)}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0;"><strong>Project:</strong></td>
            <td style="padding: 8px 0;">${escapeHtml(payload.projectName)}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0;"><strong>Triggered:</strong></td>
            <td style="padding: 8px 0;">${new Date(payload.triggeredAt).toLocaleString()}</td>
          </tr>
        </table>

        ${rcaSection}

        <p style="margin-top: 24px;">
          <a href="${payload.dashboardUrl}" style="display: inline-block; background: #0066cc; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">View in Dashboard</a>
        </p>
      </div>
    </body>
    </html>
  `;
}
```

**Workflow Integration:**
```typescript
// apps/worker/src/workflows/alert.workflow.ts

// After state transition to FIRING, trigger RCA and wait
if (transition.newState === "FIRING" && transition.shouldNotify) {
  // Start RCA workflow (child workflow)
  const rcaResult = await executeChild(rcaAnalysisWorkflow, {
    args: [{
      alertId,
      alertHistoryId: historyId,  // From transitionAlertState
      alertName,
      alertType,
      alertValue: evaluation.currentValue,
      threshold: evaluation.threshold,
      severity,
      projectId,
      projectName,
      windowStart: subMinutes(new Date(), windowMins),
      windowEnd: new Date(),
    }],
    workflowId: `rca-${alertId}-${Date.now()}`,
    taskQueue: "rca-queue",
  });

  // Dispatch notification with RCA
  await dispatchNotification({
    alertId,
    state: transition.newState,
    value: evaluation.currentValue,
    threshold: evaluation.threshold,
    rca: rcaResult.confidence > 0.3 ? {
      hypothesis: rcaResult.hypothesis,
      confidence: rcaResult.confidence,
      category: rcaResult.rootCause.category,
      topChange: rcaResult.relatedChanges[0],
      remediation: rcaResult.remediation.immediate,
      detailUrl: `${env.APP_URL}/alerts/${alertId}/rca/${historyId}`,
    } : undefined,
  });
}
```

#### Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `packages/api/src/schemas/alerting.ts` | Modify | Add RCA to payload |
| `packages/api/src/lib/alerting/adapters/discord.ts` | Modify | Add RCA embed |
| `packages/api/src/lib/alerting/adapters/gmail.ts` | Modify | Add RCA email section |
| `apps/worker/src/workflows/alert.workflow.ts` | Modify | Integrate RCA workflow |

---

### Story 2: RCA Detail Page in Dashboard

**Ticket ID:** #141
**Points:** 5
**Priority:** P1

#### Description

Create a dashboard page that displays the full RCA report with code snippets, related changes, trace samples, and user feedback collection.

#### Acceptance Criteria

- [ ] Page displays full RCA hypothesis and reasoning
- [ ] Shows confidence score with visual indicator
- [ ] Lists related commits/PRs with diffs
- [ ] Shows relevant code snippets with syntax highlighting
- [ ] Displays affected traces/spans
- [ ] Allows user feedback (helpful/not helpful)
- [ ] Links back to alert history

#### Technical Details

**Route:** `/[workspaceSlug]/projects/[projectId]/alerts/[alertId]/rca/[historyId]`

**tRPC Procedure:**
```typescript
// packages/api/src/routers/alert.ts

getRCADetail: protectedProcedure
  .input(z.object({
    alertHistoryId: z.string(),
  }))
  .query(async ({ ctx, input }) => {
    const rca = await ctx.db.alertRCA.findUnique({
      where: { alertHistoryId: input.alertHistoryId },
      include: {
        alertHistory: {
          include: {
            alert: {
              include: {
                project: true,
              },
            },
          },
        },
      },
    });

    if (!rca) {
      throw new TRPCError({ code: "NOT_FOUND", message: "RCA not found" });
    }

    // Verify access
    await assertProjectAccess(ctx.db, ctx.session.user.id, rca.alertHistory.alert.projectId);

    // Fetch related commits
    const commits = rca.relatedCommitIds.length > 0
      ? await ctx.db.gitCommit.findMany({
          where: { id: { in: rca.relatedCommitIds } },
        })
      : [];

    // Fetch related PRs
    const prs = rca.relatedPRIds.length > 0
      ? await ctx.db.gitPullRequest.findMany({
          where: { id: { in: rca.relatedPRIds } },
        })
      : [];

    // Fetch sample traces
    const traces = rca.relatedTraceIds.length > 0
      ? await ctx.db.trace.findMany({
          where: { id: { in: rca.relatedTraceIds.slice(0, 5) } },
          include: {
            spans: {
              where: { level: "ERROR" },
              take: 3,
            },
          },
        })
      : [];

    return {
      rca,
      alert: rca.alertHistory.alert,
      alertHistory: rca.alertHistory,
      commits,
      prs,
      traces,
    };
  }),

submitRCAFeedback: protectedProcedure
  .input(z.object({
    rcaId: z.string(),
    helpful: z.boolean(),
    feedback: z.string().optional(),
  }))
  .mutation(async ({ ctx, input }) => {
    return ctx.db.alertRCA.update({
      where: { id: input.rcaId },
      data: {
        helpful: input.helpful,
        feedback: input.feedback,
      },
    });
  }),
```

**Page Component:**
```tsx
// apps/web/src/app/(dashboard)/[workspaceSlug]/projects/[projectId]/alerts/[alertId]/rca/[historyId]/page.tsx

import { RCADetailPage } from "@/components/rca/rca-detail-page";

export default function Page({
  params,
}: {
  params: { workspaceSlug: string; projectId: string; alertId: string; historyId: string };
}) {
  return <RCADetailPage alertHistoryId={params.historyId} />;
}
```

**Component Structure:**
```tsx
// apps/web/src/components/rca/rca-detail-page.tsx

export function RCADetailPage({ alertHistoryId }: Props) {
  const { data, isLoading } = api.alert.getRCADetail.useQuery({ alertHistoryId });

  if (isLoading) return <RCADetailSkeleton />;
  if (!data) return <NotFound />;

  return (
    <div className="space-y-6">
      <RCAHeader rca={data.rca} alert={data.alert} alertHistory={data.alertHistory} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <RCAHypothesisCard rca={data.rca} />
          <RCAEvidenceCard rca={data.rca} />
          <RCARemediationCard rca={data.rca} />
        </div>

        <div className="space-y-6">
          <RCAConfidenceCard confidence={data.rca.confidence} />
          <RCARelatedChanges commits={data.commits} prs={data.prs} />
          <RCACodeSnippets snippets={data.rca.codeSnippets} />
        </div>
      </div>

      <RCATracesSamples traces={data.traces} />

      <RCAFeedbackCard rcaId={data.rca.id} currentFeedback={data.rca.helpful} />
    </div>
  );
}
```

**Sub-Components:**

```tsx
// components/rca/rca-hypothesis-card.tsx
function RCAHypothesisCard({ rca }: { rca: AlertRCA }) {
  const analysis = rca.analysis as RCAReport;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-yellow-500" />
          Root Cause Hypothesis
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-lg font-medium">{rca.hypothesis}</p>

        <div>
          <h4 className="font-medium text-muted-foreground mb-2">Reasoning</h4>
          <p>{analysis.reasoning}</p>
        </div>

        <div>
          <h4 className="font-medium text-muted-foreground mb-2">Category</h4>
          <Badge variant={getCategoryVariant(analysis.rootCause.category)}>
            {CATEGORY_LABELS[analysis.rootCause.category]}
          </Badge>
        </div>

        {analysis.rootCause.evidence.length > 0 && (
          <div>
            <h4 className="font-medium text-muted-foreground mb-2">Evidence</h4>
            <ul className="list-disc list-inside space-y-1">
              {analysis.rootCause.evidence.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// components/rca/rca-code-snippets.tsx
function RCACodeSnippets({ snippets }: { snippets: CodeSnippet[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Code className="h-5 w-5" />
          Related Code
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {snippets.map((snippet, i) => (
          <div key={i} className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-mono text-muted-foreground">
                {snippet.filePath}:{snippet.startLine}
              </span>
              <Badge variant="outline">
                {(snippet.similarity * 100).toFixed(0)}% match
              </Badge>
            </div>
            <pre className="bg-muted p-3 rounded-md overflow-x-auto text-sm">
              <code>{snippet.snippet}</code>
            </pre>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// components/rca/rca-feedback-card.tsx
function RCAFeedbackCard({ rcaId, currentFeedback }: Props) {
  const [feedback, setFeedback] = useState(currentFeedback);
  const [comment, setComment] = useState("");

  const submitFeedback = api.alert.submitRCAFeedback.useMutation({
    onSuccess: () => {
      toast.success("Feedback submitted", { description: "Thank you for your feedback!" });
    },
  });

  const handleFeedback = (helpful: boolean) => {
    setFeedback(helpful);
    submitFeedback.mutate({ rcaId, helpful, feedback: comment || undefined });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Was this RCA helpful?</CardTitle>
        <CardDescription>Your feedback helps improve future analyses</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-4">
          <Button
            variant={feedback === true ? "default" : "outline"}
            onClick={() => handleFeedback(true)}
          >
            <ThumbsUp className="h-4 w-4 mr-2" />
            Yes, helpful
          </Button>
          <Button
            variant={feedback === false ? "destructive" : "outline"}
            onClick={() => handleFeedback(false)}
          >
            <ThumbsDown className="h-4 w-4 mr-2" />
            Not helpful
          </Button>
        </div>

        {feedback !== null && (
          <div className="space-y-2">
            <Label htmlFor="feedback-comment">Additional feedback (optional)</Label>
            <Textarea
              id="feedback-comment"
              placeholder="What could be improved?"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
            <Button
              size="sm"
              onClick={() => submitFeedback.mutate({ rcaId, helpful: feedback, feedback: comment })}
              disabled={submitFeedback.isPending}
            >
              Submit Feedback
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

#### Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/web/src/app/(dashboard)/[workspaceSlug]/projects/[projectId]/alerts/[alertId]/rca/[historyId]/page.tsx` | Create | Route page |
| `apps/web/src/components/rca/rca-detail-page.tsx` | Create | Main component |
| `apps/web/src/components/rca/rca-hypothesis-card.tsx` | Create | Hypothesis display |
| `apps/web/src/components/rca/rca-code-snippets.tsx` | Create | Code snippets |
| `apps/web/src/components/rca/rca-feedback-card.tsx` | Create | User feedback |
| `packages/api/src/routers/alert.ts` | Modify | Add getRCADetail |

---

### Story 3: Manual RCA Trigger Button

**Ticket ID:** #142
**Points:** 3
**Priority:** P2

#### Description

Add a button on the alert history page that allows users to manually trigger RCA for any past alert, useful for re-analyzing or analyzing alerts that occurred before RCA was enabled.

#### Acceptance Criteria

- [ ] "Analyze" button visible on alert history items
- [ ] Button triggers RCA workflow via API
- [ ] Shows loading state during analysis
- [ ] Displays success/error toast
- [ ] Navigates to RCA page when complete

#### Technical Details

**tRPC Procedure:**
```typescript
// packages/api/src/routers/alert.ts

triggerRCA: protectedProcedure
  .input(z.object({
    alertHistoryId: z.string(),
  }))
  .mutation(async ({ ctx, input }) => {
    const history = await ctx.db.alertHistory.findUnique({
      where: { id: input.alertHistoryId },
      include: {
        alert: {
          include: {
            project: true,
          },
        },
      },
    });

    if (!history) {
      throw new TRPCError({ code: "NOT_FOUND" });
    }

    await assertProjectAccess(ctx.db, ctx.session.user.id, history.alert.projectId);

    // Check if RCA already exists
    const existingRCA = await ctx.db.alertRCA.findUnique({
      where: { alertHistoryId: input.alertHistoryId },
    });

    if (existingRCA) {
      return { rcaId: existingRCA.id, status: "existing" };
    }

    // Start RCA workflow
    const client = await getTemporalClient();
    await client.workflow.start("rcaAnalysisWorkflow", {
      taskQueue: "rca-queue",
      workflowId: `rca-manual-${input.alertHistoryId}`,
      args: [{
        alertId: history.alertId,
        alertHistoryId: input.alertHistoryId,
        alertName: history.alert.name,
        alertType: history.alert.type,
        alertValue: history.value,
        threshold: history.threshold,
        severity: history.alert.severity,
        projectId: history.alert.projectId,
        projectName: history.alert.project.name,
        windowStart: subMinutes(history.triggeredAt, history.alert.windowMins),
        windowEnd: history.triggeredAt,
      }],
    });

    return { status: "started" };
  }),
```

**Component:**
```tsx
// apps/web/src/components/alerts/alert-history-row.tsx

function AlertHistoryRow({ history }: { history: AlertHistoryWithRCA }) {
  const triggerRCA = api.alert.triggerRCA.useMutation({
    onSuccess: (data) => {
      if (data.status === "existing") {
        router.push(`/alerts/${history.alertId}/rca/${history.id}`);
      } else {
        toast.success("RCA Analysis Started", {
          description: "Analysis in progress. You'll be notified when complete.",
        });
      }
    },
    onError: showError,
  });

  return (
    <TableRow>
      <TableCell>{formatDate(history.triggeredAt)}</TableCell>
      <TableCell>{history.state}</TableCell>
      <TableCell>{formatAlertValue(history.alert.type, history.value)}</TableCell>
      <TableCell>
        {history.rca ? (
          <Link href={`/alerts/${history.alertId}/rca/${history.id}`}>
            <Badge variant="secondary">
              <CheckCircle className="h-3 w-3 mr-1" />
              RCA Available
            </Badge>
          </Link>
        ) : (
          <Button
            size="sm"
            variant="outline"
            onClick={() => triggerRCA.mutate({ alertHistoryId: history.id })}
            disabled={triggerRCA.isPending}
          >
            {triggerRCA.isPending ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <Search className="h-3 w-3 mr-1" />
            )}
            Analyze
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}
```

#### Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `packages/api/src/routers/alert.ts` | Modify | Add triggerRCA |
| `apps/web/src/components/alerts/alert-history-row.tsx` | Modify | Add analyze button |

---

## Sprint Backlog Summary

| Story | Points | Assignee | Status |
|-------|--------|----------|--------|
| #140 RCA in notifications | 5 | TBD | To Do |
| #141 RCA detail page | 5 | TBD | To Do |
| #142 Manual RCA trigger | 3 | TBD | To Do |
| **Total** | **13** | | |

---

## Dependencies & Blockers

| Dependency | Status | Notes |
|------------|--------|-------|
| Sprint 3 completed | ⏳ Pending | RCA workflow working |
| Existing alert pages | ✅ Done | #92-93 completed |
| Notification adapters | ✅ Done | #91 completed |

---

## User Experience Flow

```
1. Alert fires → RCA generated → Notification sent with RCA summary
                                          │
                                          ▼
2. User receives notification → Clicks "View RCA" link
                                          │
                                          ▼
3. RCA detail page loads → User reviews analysis
                                          │
                                          ▼
4. User provides feedback → Feedback stored for improvement

Alternative flow:
1. User views alert history → Sees "Analyze" button for old alerts
                                          │
                                          ▼
2. Clicks "Analyze" → RCA workflow triggered → Toast shown
                                          │
                                          ▼
3. RCA complete → User navigates to RCA page
```

---

## Definition of Ready (for Sprint 5)

By end of Sprint 4:
- [ ] Notifications include RCA when available
- [ ] RCA detail page accessible and functional
- [ ] Manual trigger works for historical alerts
- [ ] User feedback being collected
