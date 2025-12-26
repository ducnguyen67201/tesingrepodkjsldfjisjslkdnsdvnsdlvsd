# Temporal Worker Migration Specification

**Issue:** #115
**Points:** 13
**Priority:** P1
**Dependencies:** None

---

## 1. Executive Summary

Migrate the Ducsigr worker from Redis-based queue processing (LPUSH/BRPOP) to Temporal workflow orchestration. This provides better reliability, visibility, retry handling, and support for long-running tasks like LLM evaluations.

---

## 2. Current Architecture

### Redis Queue Flow

```
┌─────────────┐     LPUSH      ┌─────────────┐     BRPOP      ┌─────────────┐
│   Ingest    │ ────────────► │    Redis    │ ◄──────────── │   Worker    │
│   (Go)      │               │   Queue     │               │   (Node)    │
└─────────────┘               └─────────────┘               └─────────────┘
                                                                   │
                                                            ┌──────┴──────┐
                                                            │  Processor  │
                                                            │  (trace.ts) │
                                                            └─────────────┘
```

### Current Components

| Component | Location | Purpose |
|-----------|----------|---------|
| Queue Producer | `apps/ingest/internal/queue/producer.go` | LPUSH to Redis |
| Queue Consumer | `apps/worker/src/queue/consumer.ts` | BRPOP from Redis |
| Trace Processor | `apps/worker/src/processors/trace.ts` | Process and persist |
| Alert Evaluator | `apps/worker/src/jobs/alert-evaluator.ts` | State machine job |

### Limitations

| Issue | Impact |
|-------|--------|
| Manual retry logic | Complex error handling code |
| No visibility | Can't see job status or history |
| Timeout handling | Long-running tasks fail silently |
| State management | Alert evaluator has complex state machine |
| Dead letter queue | Manual implementation required |

---

## 3. Target Architecture

### Temporal Workflow Flow

```
┌─────────────┐    gRPC     ┌─────────────┐   Schedule   ┌─────────────┐
│   Ingest    │ ──────────► │  Temporal   │ ◄──────────► │   Worker    │
│   (Go)      │             │   Server    │              │   (Node)    │
└─────────────┘             └─────────────┘              └─────────────┘
                                   │                           │
                            ┌──────┴──────┐             ┌──────┴──────┐
                            │  Workflow   │             │  Activity   │
                            │  History    │             │  Workers    │
                            └─────────────┘             └─────────────┘
```

### Temporal Components

```
apps/worker/src/
├── temporal/
│   ├── client.ts              # Temporal client setup
│   ├── worker.ts              # Worker registration
│   └── activities/
│       ├── trace.activities.ts
│       ├── score.activities.ts
│       └── alert.activities.ts
├── workflows/
│   ├── trace.workflow.ts
│   ├── score.workflow.ts
│   └── alert-evaluation.workflow.ts
└── index.ts                   # Entry point
```

---

## 4. Infrastructure Setup

### 4.1 Docker Compose Addition

```yaml
# docker-compose.yml

services:
  # ... existing services ...

  temporal:
    image: temporalio/auto-setup:1.24
    container_name: ducsigr-temporal
    ports:
      - "7233:7233"
    environment:
      - DB=postgresql
      - DB_PORT=5432
      - POSTGRES_USER=${POSTGRES_USER:-postgres}
      - POSTGRES_PWD=${POSTGRES_PASSWORD:-postgres}
      - POSTGRES_SEEDS=postgres
      - DYNAMIC_CONFIG_FILE_PATH=config/dynamicconfig/development.yaml
    volumes:
      - ./temporal-config:/etc/temporal/config/dynamicconfig
    depends_on:
      - postgres
    networks:
      - ducsigr-network
    healthcheck:
      test: ["CMD", "tctl", "cluster", "health"]
      interval: 10s
      timeout: 5s
      retries: 5

  temporal-ui:
    image: temporalio/ui:2.26
    container_name: ducsigr-temporal-ui
    ports:
      - "8088:8080"
    environment:
      - TEMPORAL_ADDRESS=temporal:7233
      - TEMPORAL_CORS_ORIGINS=http://localhost:3000
    depends_on:
      - temporal
    networks:
      - ducsigr-network

  temporal-admin-tools:
    image: temporalio/admin-tools:1.24
    container_name: ducsigr-temporal-admin
    environment:
      - TEMPORAL_ADDRESS=temporal:7233
    depends_on:
      - temporal
    networks:
      - ducsigr-network
    stdin_open: true
    tty: true
```

### 4.2 Temporal Dynamic Config

```yaml
# temporal-config/development.yaml
system.forceSearchAttributesCacheRefreshOnRead:
  - value: true
    constraints: {}
```

### 4.3 Environment Variables

```bash
# .env additions
TEMPORAL_ADDRESS=localhost:7233
TEMPORAL_NAMESPACE=ducsigr
TEMPORAL_TASK_QUEUE=ducsigr-tasks
```

---

## 5. Worker Implementation

### 5.1 Temporal Client

```typescript
// apps/worker/src/temporal/client.ts
import { Client, Connection } from "@temporalio/client";
import { env } from "./env";

let client: Client | null = null;

export async function getTemporalClient(): Promise<Client> {
  if (client) return client;

  const connection = await Connection.connect({
    address: env.TEMPORAL_ADDRESS,
  });

  client = new Client({
    connection,
    namespace: env.TEMPORAL_NAMESPACE,
  });

  return client;
}

export async function closeTemporalClient(): Promise<void> {
  if (client) {
    await client.connection.close();
    client = null;
  }
}
```

### 5.2 Worker Setup

```typescript
// apps/worker/src/temporal/worker.ts
import { Worker, NativeConnection } from "@temporalio/worker";
import * as activities from "./activities";
import { env } from "./env";

export async function createWorker(): Promise<Worker> {
  const connection = await NativeConnection.connect({
    address: env.TEMPORAL_ADDRESS,
  });

  const worker = await Worker.create({
    connection,
    namespace: env.TEMPORAL_NAMESPACE,
    taskQueue: env.TEMPORAL_TASK_QUEUE,
    workflowsPath: require.resolve("../workflows"),
    activities,
    maxConcurrentActivityTaskExecutions: 100,
    maxConcurrentWorkflowTaskExecutions: 100,
  });

  return worker;
}
```

### 5.3 Activities

```typescript
// apps/worker/src/temporal/activities/trace.activities.ts
import { prisma } from "@ducsigr/db";
import { calculateSpanCost } from "@ducsigr/api/lib/cost";

export interface PersistTraceInput {
  id: string;
  projectId: string;
  name: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
  sessionId?: string;
  userId?: string;
  spans: SpanInput[];
}

export async function persistTrace(input: PersistTraceInput): Promise<string> {
  const trace = await prisma.$transaction(async (tx) => {
    // Resolve session ID if provided
    let internalSessionId: string | null = null;
    if (input.sessionId) {
      const session = await tx.traceSession.upsert({
        where: {
          projectId_externalId: {
            projectId: input.projectId,
            externalId: input.sessionId,
          },
        },
        create: {
          projectId: input.projectId,
          externalId: input.sessionId,
        },
        update: {},
      });
      internalSessionId = session.id;
    }

    // Create trace
    const trace = await tx.trace.create({
      data: {
        id: input.id,
        projectId: input.projectId,
        name: input.name,
        timestamp: input.timestamp,
        metadata: input.metadata ?? {},
        sessionId: internalSessionId,
      },
    });

    // Create spans
    await tx.span.createMany({
      data: input.spans.map((span) => ({
        ...span,
        traceId: trace.id,
      })),
    });

    return trace;
  });

  return trace.id;
}

export async function calculateTraceCosts(traceId: string): Promise<void> {
  const spans = await prisma.span.findMany({
    where: {
      traceId,
      model: { not: null },
      totalTokens: { gt: 0 },
    },
  });

  for (const span of spans) {
    const cost = await calculateSpanCost(span);
    if (cost) {
      await prisma.span.update({
        where: { id: span.id },
        data: {
          inputCost: cost.inputCost,
          outputCost: cost.outputCost,
          totalCost: cost.totalCost,
          pricingId: cost.pricingId,
        },
      });
    }
  }
}

export async function updateCostSummaries(
  projectId: string,
  date: Date
): Promise<void> {
  // Aggregate costs by model for the day
  const summaries = await prisma.span.groupBy({
    by: ["model"],
    where: {
      trace: { projectId },
      startTime: {
        gte: new Date(date.toISOString().split("T")[0]),
        lt: new Date(
          new Date(date).setDate(date.getDate() + 1)
        ),
      },
      totalCost: { gt: 0 },
    },
    _sum: {
      inputTokens: true,
      outputTokens: true,
      totalTokens: true,
      inputCost: true,
      outputCost: true,
      totalCost: true,
    },
    _count: true,
  });

  // Upsert daily summaries
  for (const summary of summaries) {
    if (!summary.model) continue;

    await prisma.dailyCostSummary.upsert({
      where: {
        projectId_date_model: {
          projectId,
          date: new Date(date.toISOString().split("T")[0]),
          model: summary.model,
        },
      },
      create: {
        projectId,
        date: new Date(date.toISOString().split("T")[0]),
        model: summary.model,
        inputTokens: summary._sum.inputTokens ?? 0,
        outputTokens: summary._sum.outputTokens ?? 0,
        totalTokens: summary._sum.totalTokens ?? 0,
        inputCost: summary._sum.inputCost ?? 0,
        outputCost: summary._sum.outputCost ?? 0,
        totalCost: summary._sum.totalCost ?? 0,
        spanCount: summary._count,
      },
      update: {
        inputTokens: summary._sum.inputTokens ?? 0,
        outputTokens: summary._sum.outputTokens ?? 0,
        totalTokens: summary._sum.totalTokens ?? 0,
        inputCost: summary._sum.inputCost ?? 0,
        outputCost: summary._sum.outputCost ?? 0,
        totalCost: summary._sum.totalCost ?? 0,
        spanCount: summary._count,
      },
    });
  }
}
```

### 5.4 Workflows

```typescript
// apps/worker/src/workflows/trace.workflow.ts
import { proxyActivities, sleep } from "@temporalio/workflow";
import type * as activities from "../temporal/activities/trace.activities";

const {
  persistTrace,
  calculateTraceCosts,
  updateCostSummaries,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "30s",
  retry: {
    maximumAttempts: 3,
    initialInterval: "1s",
    backoffCoefficient: 2,
    maximumInterval: "30s",
  },
});

export interface TraceWorkflowInput {
  id: string;
  projectId: string;
  name: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
  sessionId?: string;
  userId?: string;
  spans: SpanInput[];
}

export async function traceWorkflow(input: TraceWorkflowInput): Promise<string> {
  // Step 1: Persist trace and spans
  const traceId = await persistTrace({
    ...input,
    timestamp: new Date(input.timestamp),
  });

  // Step 2: Calculate costs (can fail independently)
  try {
    await calculateTraceCosts(traceId);
  } catch (error) {
    // Log but don't fail the workflow
    console.error("Cost calculation failed:", error);
  }

  // Step 3: Update daily summaries
  try {
    await updateCostSummaries(input.projectId, new Date(input.timestamp));
  } catch (error) {
    console.error("Summary update failed:", error);
  }

  return traceId;
}
```

```typescript
// apps/worker/src/workflows/alert-evaluation.workflow.ts
import {
  proxyActivities,
  sleep,
  condition,
  defineSignal,
  setHandler,
} from "@temporalio/workflow";
import type * as activities from "../temporal/activities/alert.activities";

const {
  evaluateAlert,
  transitionAlertState,
  dispatchNotification,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "10s",
  retry: {
    maximumAttempts: 3,
  },
});

export const triggerEvaluationSignal = defineSignal("triggerEvaluation");

export interface AlertEvaluationWorkflowInput {
  alertId: string;
  projectId: string;
  evaluationIntervalMs: number;
}

export async function alertEvaluationWorkflow(
  input: AlertEvaluationWorkflowInput
): Promise<void> {
  let shouldEvaluate = false;

  // Handle manual trigger signal
  setHandler(triggerEvaluationSignal, () => {
    shouldEvaluate = true;
  });

  while (true) {
    // Wait for interval or signal
    await condition(
      () => shouldEvaluate,
      input.evaluationIntervalMs
    );
    shouldEvaluate = false;

    // Evaluate alert condition
    const result = await evaluateAlert(input.alertId);

    if (result.shouldTransition) {
      const notification = await transitionAlertState(
        input.alertId,
        result.newState
      );

      if (notification) {
        await dispatchNotification(notification);
      }
    }
  }
}
```

---

## 6. Go Ingest Integration

### 6.1 Temporal Client for Go

```go
// apps/ingest/internal/temporal/client.go
package temporal

import (
	"context"
	"go.temporal.io/sdk/client"
)

type Client struct {
	client    client.Client
	taskQueue string
}

func New(address, namespace, taskQueue string) (*Client, error) {
	c, err := client.Dial(client.Options{
		HostPort:  address,
		Namespace: namespace,
	})
	if err != nil {
		return nil, err
	}

	return &Client{
		client:    c,
		taskQueue: taskQueue,
	}, nil
}

func (c *Client) StartTraceWorkflow(ctx context.Context, input TraceWorkflowInput) (string, error) {
	workflowOptions := client.StartWorkflowOptions{
		ID:        "trace-" + input.ID,
		TaskQueue: c.taskQueue,
	}

	we, err := c.client.ExecuteWorkflow(ctx, workflowOptions, "traceWorkflow", input)
	if err != nil {
		return "", err
	}

	return we.GetID(), nil
}

func (c *Client) Close() {
	c.client.Close()
}
```

### 6.2 Update Handler

```go
// apps/ingest/internal/handler/trace.go (modified)

func (h *Handler) HandleTrace(w http.ResponseWriter, r *http.Request) {
	// ... existing validation ...

	// Instead of Redis queue, start Temporal workflow
	workflowID, err := h.temporal.StartTraceWorkflow(r.Context(), TraceWorkflowInput{
		ID:        trace.ID,
		ProjectID: projectID,
		Name:      trace.Name,
		Timestamp: trace.Timestamp,
		Metadata:  trace.Metadata,
		SessionID: trace.SessionID,
		UserID:    trace.UserID,
		Spans:     trace.Spans,
	})

	if err != nil {
		log.Error().Err(err).Msg("Failed to start trace workflow")
		http.Error(w, "Failed to process trace", http.StatusInternalServerError)
		return
	}

	// Return response
	w.WriteHeader(http.StatusAccepted)
	json.NewEncoder(w).Encode(IngestTraceResponse{
		TraceID:    trace.ID,
		SpanIDs:    spanIDs,
		WorkflowID: workflowID,
		Success:    true,
	})
}
```

---

## 7. Migration Strategy

### Phase 1: Parallel Running (1 week)
1. Deploy Temporal infrastructure
2. Keep Redis queue running
3. Add feature flag for workflow routing
4. Route 10% traffic to Temporal
5. Monitor and compare

### Phase 2: Gradual Migration (1 week)
1. Increase Temporal traffic to 50%
2. Migrate alert evaluator to Temporal
3. Monitor workflow history
4. Compare latency and reliability

### Phase 3: Full Migration (1 week)
1. Route 100% traffic to Temporal
2. Keep Redis as fallback
3. Monitor for 1 week
4. Remove Redis queue code

### Phase 4: Cleanup
1. Remove Redis queue consumer
2. Remove feature flags
3. Update documentation
4. Archive old code

---

## 8. Monitoring & Observability

### 8.1 Temporal UI Access

- URL: `http://localhost:8088`
- Features:
  - Workflow execution history
  - Activity task details
  - Failed workflow debugging
  - Workflow search by ID/type

### 8.2 Metrics to Track

| Metric | Source | Alert Threshold |
|--------|--------|-----------------|
| Workflow completion rate | Temporal | < 99% |
| Workflow latency P95 | Temporal | > 5s |
| Activity failure rate | Temporal | > 1% |
| Worker task slots used | Temporal | > 80% |
| Database connection pool | Prisma | > 90% |

### 8.3 Alerting Rules

```yaml
# prometheus/alerts.yml
groups:
  - name: temporal
    rules:
      - alert: TemporalWorkflowFailureRate
        expr: rate(temporal_workflow_failed_total[5m]) > 0.01
        for: 5m
        annotations:
          summary: "High Temporal workflow failure rate"

      - alert: TemporalActivityLatency
        expr: histogram_quantile(0.95, temporal_activity_execution_latency_bucket) > 10
        for: 5m
        annotations:
          summary: "High Temporal activity latency"
```

---

## 9. Rollback Plan

### If Temporal Fails

1. Set feature flag to route all traffic to Redis
2. Restart worker with Redis consumer
3. Investigate Temporal issues
4. Fix and redeploy

### Feature Flag Implementation

```typescript
// apps/ingest/internal/config/config.go
type Config struct {
	// ... existing ...
	UseTemporalWorkflows bool   `env:"USE_TEMPORAL_WORKFLOWS" envDefault:"false"`
}
```

---

## 10. Testing Strategy

### Unit Tests
- [ ] Activity functions with mocked Prisma
- [ ] Workflow logic with Temporal test framework
- [ ] Client error handling

### Integration Tests
- [ ] End-to-end workflow execution
- [ ] Retry behavior verification
- [ ] Signal handling

### Load Tests
- [ ] 1000 concurrent workflows
- [ ] Activity timeout handling
- [ ] Worker scaling behavior

---

## 11. Definition of Done

- [ ] Temporal server running in docker-compose
- [ ] Temporal UI accessible
- [ ] TraceWorkflow implemented and tested
- [ ] ScoreWorkflow implemented and tested
- [ ] AlertEvaluationWorkflow implemented and tested
- [ ] Go client integrated with ingest service
- [ ] Feature flag for gradual rollout
- [ ] Monitoring dashboards created
- [ ] Rollback plan documented
- [ ] All tests passing
- [ ] Documentation updated

---

## 12. References

- [Temporal TypeScript SDK](https://docs.temporal.io/develop/typescript)
- [Temporal Go SDK](https://docs.temporal.io/develop/go)
- [Temporal Docker Setup](https://docs.temporal.io/self-hosted-guide/docker-compose)
- [Workflow Design Patterns](https://docs.temporal.io/encyclopedia/workflow-patterns)
- [Activity Retry Policies](https://docs.temporal.io/retry-policies)
