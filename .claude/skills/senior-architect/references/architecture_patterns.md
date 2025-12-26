# Architecture Patterns for High-Velocity Startups

## Philosophy

> "Move fast, but don't break things you can't fix."

This guide is for teams that ship daily, iterate weekly, and scale monthly. Every pattern here has been battle-tested in production environments handling millions of requests.

---

## Core Architecture Patterns

### 1. Modular Monolith (Recommended Starting Point)

**Why it matters:** Start with a modular monolith. Microservices are a scaling strategy, not an architecture goal.

```
app/
├── modules/
│   ├── auth/           # Authentication domain
│   │   ├── api/        # HTTP handlers
│   │   ├── service/    # Business logic
│   │   ├── repo/       # Data access
│   │   └── events/     # Domain events
│   ├── billing/
│   ├── projects/
│   └── traces/         # Ducsigr specific
├── shared/
│   ├── middleware/
│   ├── errors/
│   └── telemetry/
└── infra/
    ├── database/
    ├── cache/
    └── queue/
```

**Rules:**
- Modules communicate via well-defined interfaces (not direct DB access)
- Each module owns its data (no cross-module table joins)
- Extract to microservice only when you have a clear scaling need

**When to extract a module to a service:**
- Different scaling requirements (CPU vs I/O bound)
- Different deployment cadence needed
- Team ownership boundaries
- Regulatory/compliance isolation

### 2. Hexagonal Architecture (Ports & Adapters)

**For any service that needs to be testable and maintainable.**

```typescript
// Domain Layer - Pure business logic, no dependencies
interface Trace {
  id: string;
  projectId: string;
  spans: Span[];
  startTime: Date;
  endTime: Date;
}

// Port - Interface the domain exposes
interface TraceRepository {
  save(trace: Trace): Promise<void>;
  findById(id: string): Promise<Trace | null>;
  findByProject(projectId: string, cursor?: string): Promise<PaginatedResult<Trace>>;
}

// Port - What the domain needs from external services
interface MetricsPublisher {
  publish(event: TraceIngested): Promise<void>;
}

// Adapter - PostgreSQL implementation
class PostgresTraceRepository implements TraceRepository {
  constructor(private prisma: PrismaClient) {}

  async save(trace: Trace): Promise<void> {
    await this.prisma.trace.create({
      data: {
        id: trace.id,
        projectId: trace.projectId,
        startTime: trace.startTime,
        endTime: trace.endTime,
        spans: {
          create: trace.spans.map(toSpanData)
        }
      }
    });
  }
}

// Adapter - Redis implementation for cache
class CachedTraceRepository implements TraceRepository {
  constructor(
    private primary: TraceRepository,
    private cache: Redis,
    private ttl: number = 300
  ) {}

  async findById(id: string): Promise<Trace | null> {
    const cached = await this.cache.get(`trace:${id}`);
    if (cached) return JSON.parse(cached);

    const trace = await this.primary.findById(id);
    if (trace) {
      await this.cache.setex(`trace:${id}`, this.ttl, JSON.stringify(trace));
    }
    return trace;
  }
}
```

### 3. Event-Driven Architecture

**Essential for decoupling and scaling.**

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Ingest    │────▶│    Redis    │────▶│   Worker    │
│   Service   │     │   Streams   │     │   Service   │
└─────────────┘     └─────────────┘     └─────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │   Metrics   │
                    │   Service   │
                    └─────────────┘
```

**Event Design:**

```typescript
// Event Schema - Always version your events
interface DomainEvent<T = unknown> {
  id: string;              // Idempotency key
  type: string;            // e.g., "trace.ingested.v1"
  version: number;         // Schema version
  timestamp: Date;
  source: string;          // Service that emitted
  correlationId: string;   // For distributed tracing
  payload: T;
}

// Concrete event
interface TraceIngestedV1 {
  traceId: string;
  projectId: string;
  spanCount: number;
  totalDuration: number;
  hasErrors: boolean;
}

// Event handler with idempotency
class TraceMetricsHandler {
  constructor(
    private metricsRepo: MetricsRepository,
    private processedEvents: Set<string> // Redis SET in production
  ) {}

  async handle(event: DomainEvent<TraceIngestedV1>): Promise<void> {
    // Idempotency check
    if (await this.processedEvents.has(event.id)) {
      return; // Already processed
    }

    await this.metricsRepo.incrementTraceCount(event.payload.projectId);
    await this.metricsRepo.recordLatency(
      event.payload.projectId,
      event.payload.totalDuration
    );

    await this.processedEvents.add(event.id);
  }
}
```

### 4. CQRS (Command Query Responsibility Segregation)

**When reads and writes have different scaling needs.**

```typescript
// Write Model - Optimized for consistency
interface TraceCommandService {
  ingestTrace(command: IngestTraceCommand): Promise<TraceId>;
  updateSpanStatus(command: UpdateSpanCommand): Promise<void>;
}

// Read Model - Optimized for queries (denormalized)
interface TraceQueryService {
  getTraceTimeline(traceId: string): Promise<TraceTimelineView>;
  getProjectMetrics(projectId: string, range: TimeRange): Promise<MetricsView>;
  searchSpans(query: SpanSearchQuery): Promise<PaginatedSpans>;
}

// Separate read-optimized tables
// traces_read_model (denormalized, includes computed fields)
// span_search_index (for full-text search)
// project_metrics_hourly (pre-aggregated)
```

**When to use:**
- Read/write ratio > 10:1
- Complex read queries slowing down writes
- Need different consistency guarantees for reads vs writes

---

## API Design Patterns

### 1. Resource-Oriented REST

```typescript
// Consistent URL structure
GET    /v1/projects                    # List projects
POST   /v1/projects                    # Create project
GET    /v1/projects/:id                # Get project
PATCH  /v1/projects/:id                # Update project
DELETE /v1/projects/:id                # Delete project

GET    /v1/projects/:id/traces         # List traces for project
GET    /v1/projects/:id/api-keys       # List API keys for project

// Actions (non-CRUD operations)
POST   /v1/projects/:id/actions/archive
POST   /v1/api-keys/:id/actions/rotate
```

### 2. Pagination Pattern

```typescript
// Cursor-based pagination (scales infinitely)
interface PaginatedRequest {
  cursor?: string;    // Opaque cursor (base64 encoded)
  limit: number;      // Max 100
}

interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    nextCursor: string | null;
    hasMore: boolean;
  };
}

// Implementation
async function listTraces(
  projectId: string,
  { cursor, limit }: PaginatedRequest
): Promise<PaginatedResponse<Trace>> {
  const decodedCursor = cursor ? decodeCursor(cursor) : null;

  const traces = await prisma.trace.findMany({
    where: {
      projectId,
      ...(decodedCursor && {
        createdAt: { lt: decodedCursor.createdAt },
        id: { lt: decodedCursor.id }
      })
    },
    orderBy: [
      { createdAt: 'desc' },
      { id: 'desc' }
    ],
    take: limit + 1 // Fetch one extra to check hasMore
  });

  const hasMore = traces.length > limit;
  const data = hasMore ? traces.slice(0, -1) : traces;

  return {
    data,
    pagination: {
      hasMore,
      nextCursor: hasMore ? encodeCursor(data[data.length - 1]) : null
    }
  };
}
```

### 3. Error Response Pattern

```typescript
// Consistent error shape
interface ApiError {
  error: {
    code: string;           // Machine-readable: "VALIDATION_ERROR"
    message: string;        // Human-readable
    details?: ErrorDetail[];
    requestId: string;      // For debugging
  };
}

interface ErrorDetail {
  field?: string;
  code: string;
  message: string;
}

// Standard error codes
const ERROR_CODES = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
} as const;
```

---

## Database Patterns

### 1. Soft Deletes with Hard Delete Cleanup

```sql
-- Soft delete for immediate "deletion"
ALTER TABLE traces ADD COLUMN deleted_at TIMESTAMPTZ;
CREATE INDEX idx_traces_deleted ON traces (deleted_at) WHERE deleted_at IS NOT NULL;

-- Query only active records
SELECT * FROM traces WHERE deleted_at IS NULL;

-- Background job for hard delete (after retention period)
DELETE FROM traces
WHERE deleted_at < NOW() - INTERVAL '30 days'
LIMIT 1000; -- Batch to avoid lock contention
```

### 2. Optimistic Locking

```typescript
// Prevent lost updates
async function updateProject(
  id: string,
  data: UpdateProjectData,
  expectedVersion: number
): Promise<Project> {
  const result = await prisma.project.updateMany({
    where: {
      id,
      version: expectedVersion // Optimistic lock
    },
    data: {
      ...data,
      version: { increment: 1 }
    }
  });

  if (result.count === 0) {
    throw new ConflictError('Project was modified by another request');
  }

  return prisma.project.findUnique({ where: { id } });
}
```

### 3. Partitioning Strategy for Time-Series Data

```sql
-- Partition traces by month for efficient queries and cleanup
CREATE TABLE traces (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  -- ... other columns
) PARTITION BY RANGE (created_at);

-- Create partitions
CREATE TABLE traces_2024_01 PARTITION OF traces
  FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');

-- Drop old partitions instead of DELETE (instant)
DROP TABLE traces_2023_01;
```

---

## Caching Patterns

### 1. Cache-Aside (Lazy Loading)

```typescript
async function getProject(id: string): Promise<Project | null> {
  // Try cache first
  const cached = await redis.get(`project:${id}`);
  if (cached) {
    return JSON.parse(cached);
  }

  // Cache miss - load from DB
  const project = await prisma.project.findUnique({ where: { id } });

  if (project) {
    // Cache for 5 minutes
    await redis.setex(`project:${id}`, 300, JSON.stringify(project));
  }

  return project;
}

// Invalidate on update
async function updateProject(id: string, data: UpdateData): Promise<Project> {
  const project = await prisma.project.update({ where: { id }, data });
  await redis.del(`project:${id}`); // Invalidate cache
  return project;
}
```

### 2. Cache Stampede Prevention

```typescript
// Use locks to prevent thundering herd
async function getWithLock<T>(
  key: string,
  ttl: number,
  loader: () => Promise<T>
): Promise<T> {
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);

  const lockKey = `lock:${key}`;
  const acquired = await redis.set(lockKey, '1', 'NX', 'EX', 10);

  if (!acquired) {
    // Another process is loading, wait and retry
    await sleep(100);
    return getWithLock(key, ttl, loader);
  }

  try {
    const data = await loader();
    await redis.setex(key, ttl, JSON.stringify(data));
    return data;
  } finally {
    await redis.del(lockKey);
  }
}
```

---

## Anti-Patterns to Avoid

### 1. Distributed Monolith
**Problem:** Microservices that require synchronized deployments
**Solution:** Keep services truly independent, use async communication

### 2. Shared Database
**Problem:** Multiple services reading/writing the same tables
**Solution:** Each service owns its data, expose via APIs

### 3. N+1 Queries
**Problem:** Fetching related data in a loop
```typescript
// BAD
const traces = await getTraces();
for (const trace of traces) {
  trace.spans = await getSpans(trace.id); // N queries!
}

// GOOD
const traces = await prisma.trace.findMany({
  include: { spans: true } // Single query with JOIN
});
```

### 4. Premature Optimization
**Problem:** Caching everything from day one
**Solution:** Measure first, optimize bottlenecks only

### 5. Synchronous Everything
**Problem:** User waits for email to send, metrics to record
**Solution:** Async processing for non-critical paths

---

## Quick Decision Matrix

| Scenario | Pattern |
|----------|---------|
| Starting new project | Modular Monolith |
| High read/write ratio | CQRS |
| Need service isolation | Hexagonal Architecture |
| Background processing | Event-Driven + Queue |
| Time-series data | Partitioned Tables |
| Frequently accessed data | Cache-Aside |
| Complex aggregations | Materialized Views |
| Multi-step workflows | Saga Pattern |

---

## References

- Martin Fowler's Patterns of Enterprise Application Architecture
- Domain-Driven Design by Eric Evans
- Building Microservices by Sam Newman
- Designing Data-Intensive Applications by Martin Kleppmann
