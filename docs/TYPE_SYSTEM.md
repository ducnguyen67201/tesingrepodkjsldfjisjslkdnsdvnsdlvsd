# Type System

Ducsigr uses two type systems that serve different purposes:

## Overview

| Type System | Purpose | Source | Generated To |
|-------------|---------|--------|--------------|
| **Protobuf** | API contracts between services | `proto/*.proto` | TypeScript, Go |
| **Prisma** | Database schema & ORM | `schema.prisma` | TypeScript |

## Why Two Type Systems?

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│   Protobuf (API Layer)              Prisma (Database Layer)    │
│   ────────────────────              ───────────────────────    │
│                                                                 │
│   • Service-to-service contracts    • Database schema          │
│   • SDK contracts                   • Type-safe queries        │
│   • Queue message formats           • Migrations               │
│   • Language agnostic (Go + TS)     • TypeScript only          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Protobuf is used for:
- External API (SDK → Ingest)
- Internal communication (Ingest → Worker via Redis)
- Cross-language type safety (Go and TypeScript)

### Prisma is used for:
- Database operations (Worker → PostgreSQL, Web → PostgreSQL)
- Type-safe queries with autocomplete
- Database migrations

## Protobuf

### Source Files

```
proto/ducsigr/v1/
├── common.proto     # Shared types: TokenUsage, SpanLevel
├── trace.proto      # Core types: Trace, Span, Project, ApiKey
└── ingest.proto     # API types: IngestTraceRequest/Response
```

### Generated Output

```bash
make proto
```

**TypeScript** (`packages/proto/src/generated/`):
```typescript
// Auto-generated - do not edit
export interface Trace {
  id: string;
  projectId: string;
  name: string;
  timestamp?: Date;
  metadata?: { [key: string]: any };
}

export interface IngestTraceRequest {
  traceId?: string;
  name: string;
  metadata?: { [key: string]: any };
  spans: IngestSpan[];
}
```

**Go** (`apps/ingest/internal/proto/ducsigrv1/`):
```go
// Auto-generated - do not edit
type Trace struct {
    Id        string
    ProjectId string
    Name      string
    Timestamp *timestamppb.Timestamp
    Metadata  *structpb.Struct
}
```

### Usage

**TypeScript (SDK/Worker)**:
```typescript
import { IngestTraceRequest, Trace } from "@ducsigr/proto";

const request: IngestTraceRequest = {
  name: "my-trace",
  spans: [{ name: "span-1", startTime: new Date() }]
};
```

**Go (Ingest)**:
```go
import pb "github.com/ducsigr/ingest/internal/proto/ducsigrv1"

trace := &pb.Trace{
    Id:   "123",
    Name: "my-trace",
}
```

### Go Module Structure

The Go ingest service uses a clean module path for shorter imports:

```go
// Module: github.com/ducsigr/ingest

// Internal packages
import "github.com/ducsigr/ingest/internal/config"
import "github.com/ducsigr/ingest/internal/handler"
import "github.com/ducsigr/ingest/internal/model"
import "github.com/ducsigr/ingest/internal/queue"
import "github.com/ducsigr/ingest/internal/server"

// Generated proto types
import pb "github.com/ducsigr/ingest/internal/proto/ducsigrv1"
```

## Prisma

### Source File

```prisma
// packages/db/prisma/schema.prisma

model Trace {
  id        String   @id @default(cuid())
  projectId String
  project   Project  @relation(fields: [projectId], references: [id])
  name      String
  timestamp DateTime @default(now())
  metadata  Json?
  spans     Span[]
}
```

### Generated Output

```bash
pnpm db:generate
```

Generated to `node_modules/@prisma/client`:
```typescript
// Auto-generated Prisma types
export type Trace = {
  id: string;
  projectId: string;
  name: string;
  timestamp: Date;
  metadata: Prisma.JsonValue | null;
}

export type Prisma.TraceCreateInput = {
  id?: string;
  name: string;
  timestamp?: Date;
  metadata?: Prisma.InputJsonValue;
  project: Prisma.ProjectCreateNestedOneWithoutTracesInput;
  spans?: Prisma.SpanCreateNestedManyWithoutTraceInput;
}
```

### Usage

```typescript
import { prisma, Trace, Prisma } from "@ducsigr/db";

// Query with full type safety
const traces: Trace[] = await prisma.trace.findMany({
  where: { projectId: "123" },
  include: { spans: true }
});

// Create with typed input
const newTrace = await prisma.trace.create({
  data: {
    name: "my-trace",
    project: { connect: { id: "123" } }
  }
});
```

## Conversion Between Types

The Worker service converts Proto types to Prisma types:

```typescript
// apps/worker/src/processors/trace.ts

// Proto/Queue format (from Go Ingest)
interface QueueTraceData {
  ID: string;           // Go uses PascalCase
  ProjectID: string;
  Name: string;
  Timestamp: string;    // ISO string
}

// Convert to Prisma format
function convertTrace(data: QueueTraceData): Prisma.TraceCreateInput {
  return {
    id: data.ID,                              // Rename field
    name: data.Name,
    timestamp: new Date(data.Timestamp),      // Parse string to Date
    project: { connect: { id: data.ProjectID } }  // Prisma relation
  };
}
```

### Conversion Table

| Proto (Queue) | Prisma (DB) | Conversion |
|---------------|-------------|------------|
| `ID` | `id` | Rename (camelCase) |
| `Timestamp: string` | `timestamp: Date` | `new Date(...)` |
| `ProjectID` | `project: { connect }` | Prisma relation |
| `Metadata: object` | `metadata: JsonValue` | Direct mapping |
| `Level: number` | `level: SpanLevel` | Enum conversion |

## Best Practices

### 1. Edit Proto First for API Changes

```bash
# 1. Edit proto file
vim proto/ducsigr/v1/trace.proto

# 2. Regenerate
make proto

# 3. Update conversion code if needed
vim apps/worker/src/processors/trace.ts
```

### 2. Edit Prisma First for Database Changes

```bash
# 1. Edit schema
vim packages/db/prisma/schema.prisma

# 2. Regenerate client
pnpm db:generate

# 3. Apply to database
pnpm db:push  # or db:migrate for production
```

### 3. Keep Types in Sync

When adding a new field:

1. Add to `proto/*.proto` (API contract)
2. Add to `schema.prisma` (database)
3. Update conversion code in Worker
4. Regenerate both: `make proto && pnpm db:generate`

### 4. Don't Create Manual Type Files

**Bad:**
```typescript
// packages/shared/src/types.ts
export interface Trace { ... }  // ❌ Redundant, will drift
```

**Good:**
```typescript
// Import from generated sources
import { Trace } from "@ducsigr/proto";      // ✅ API types
import { Trace } from "@ducsigr/db";         // ✅ DB types
```
