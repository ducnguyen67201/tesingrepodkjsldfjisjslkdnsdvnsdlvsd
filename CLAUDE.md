# CognObserve - Claude Code Context

## Project Overview
CognObserve is an AI Platform Monitoring & Observability system. It provides tracing, monitoring, and analytics for AI/LLM applications.

## Tech Stack
- **Monorepo**: pnpm 9.15 workspaces + Turborepo 2.5
- **Web**: Next.js 16, React 19, TypeScript 5.7, Tailwind CSS 3.4, shadcn/ui (yellow theme)
- **Ingest**: Node.js 24+ with TypeScript 5.7 (OTLP trace ingestion)
- **Worker**: Node.js 24+ with TypeScript 5.7 + Temporal SDK
- **Orchestration**: Temporal (durable workflow engine)
- **Database**: PostgreSQL with Prisma 7 (Rust-free, ESM)
- **Cache**: Redis
- **Type Sharing**: Protocol Buffers (Buf)
- **Containerization**: Docker Compose
- **Linting**: ESLint 9, Prettier 3.4

## Project Structure
```
CognObserve/
├── proto/                       # Protobuf definitions (source of truth)
│   └── cognobserve/v1/
│       ├── common.proto         # Shared types (TokenUsage, SpanLevel)
│       ├── trace.proto          # Trace, Span, Project, ApiKey
│       └── ingest.proto         # Ingestion API messages
├── apps/
│   ├── web/                     # Next.js dashboard & API
│   │   └── src/app/
│   ├── ingest-node/             # Node.js OTLP ingestion service
│   │   └── src/
│   │       ├── config/          # Configuration
│   │       ├── middleware/      # Auth, rate limiting
│   │       ├── pipeline/        # Chain of Responsibility handlers
│   │       ├── routes/          # HTTP routes
│   │       └── lib/             # Utilities (db, logger, metrics)
│   └── worker/                  # Temporal worker (TypeScript)
│       └── src/
│           ├── temporal/        # Temporal config (client, worker, types)
│           │   └── activities/  # Activity implementations (READ-ONLY)
│           ├── workflows/       # Workflow definitions
│           ├── startup/         # Workflow starters on boot
│           └── lib/             # Utilities (env, trpc-caller)
├── packages/
│   ├── proto/                   # Generated TypeScript types
│   │   └── src/generated/
│   ├── api/                     # tRPC routers + schemas
│   │   └── src/
│   │       ├── routers/         # tRPC routers (including internal.ts)
│   │       └── schemas/         # Zod schemas (source of truth)
│   ├── config-eslint/
│   ├── config-typescript/
│   ├── db/                      # Prisma schema & client
│   └── shared/                  # Shared utilities & constants
├── buf.yaml                     # Buf configuration
├── buf.gen.yaml                 # Code generation config
├── turbo.json
├── docker-compose.yml
├── Makefile                     # Root commands
└── package.json
```

## Commands

### Proto Generation (Types)
```bash
# Generate types for Go and TypeScript
make proto

# Lint proto files
make proto-lint

# Check breaking changes
make proto-breaking
```

### Development
```bash
# Install all dependencies
make install

# Start databases (PostgreSQL, Redis, Temporal)
make docker-up

# Copy environment file
cp .env.example .env

# Generate Prisma client
pnpm db:generate

# Terminal 1: Run TypeScript apps (web + worker)
pnpm dev

# Terminal 2: Run ingest service
make dev-ingest
```

### Temporal UI
- **URL**: http://localhost:8088
- **Purpose**: Monitor workflows, view execution history, debug failures
- **Namespace**: `default`

### Build & Deploy
```bash
# Build all
make build

# Build ingest Docker image
docker build -f apps/ingest-node/Dockerfile -t cognobserve-ingest .
```

## Architecture

### Data Flow
```
SDK → [Ingest (Node.js)] → PostgreSQL
              ↓
         [Temporal] → [Worker (TS)] → [Web API] → PostgreSQL
                                          ↑
                                    [Web (Next.js)]

Note: Ingest service writes traces directly. Worker activities are READ-ONLY.
```

## Services

| Service | Port | Purpose |
|---------|------|---------|
| Web | 3000 | Dashboard, API (authoritative for mutations) |
| Ingest | 8080 | OTLP trace ingestion (JSON + protobuf) |
| Worker | - | Temporal worker (READ-ONLY activities) |
| Temporal | 7233 | Workflow orchestration |
| Temporal UI | 8088 | Workflow monitoring dashboard |
| PostgreSQL | 5432 | Primary database |
| Redis | 6379 | Cache (Temporal uses PostgreSQL) |

## Database Schema
Core models in `packages/db/prisma/schema.prisma`:
- **Project**: Organization/project container
- **ApiKey**: Authentication keys per project
- **Trace**: Top-level trace for a request/operation
- **Span**: Individual operations within a trace (LLM calls, etc.)

## Worker Architecture (Temporal-based)

The worker (`apps/worker/`) uses Temporal for durable workflow orchestration. All background processing runs as Temporal workflows with activities.

### Workflow Documentation (IMPORTANT)

**For detailed workflow documentation, ALWAYS read:**
```
docs/WORKFLOWS.md
```

This document contains:
- Complete workflow registry and types
- Step-by-step guide for adding new workflows
- Activity patterns and internal procedures
- Alert system details
- Debugging guide

**When adding a new workflow, UPDATE `docs/WORKFLOWS.md`** to keep it current.

### Quick Reference

| Workflow | Purpose | Duration |
|----------|---------|----------|
| `traceIngestionWorkflow` | Process trace + spans | Short-lived |
| `scoreIngestionWorkflow` | Process score | Short-lived |
| `alertEvaluationWorkflow` | Evaluate alerts | Long-running |
| `githubIndexWorkflow` | Index GitHub events | Short-lived |
| `rcaAnalysisWorkflow` | Root cause analysis | Short-lived |
| `evalPipelineWorkflow` | Eval regression detection | Short-lived |

**Key files:**
| File | Purpose |
|------|---------|
| `apps/worker/src/startup/index.ts` | Workflow registry (source of truth) |
| `apps/worker/src/workflows/*.ts` | Workflow definitions |
| `apps/worker/src/temporal/activities/*.ts` | Activities (READ-ONLY) |
| `docs/WORKFLOWS.md` | Full documentation |

## Temporal Architecture (CRITICAL)

The worker uses Temporal for durable workflow orchestration. **Temporal activities MUST use tRPC internal procedures for database mutations.**

### The Golden Rule: Activities Use tRPC Internal Caller

**All database mutations MUST go through tRPC internal procedures.** This ensures:
- Single source of truth for business logic
- Proper authorization via internal secret
- Consistent audit trails
- Type-safe communication

```
┌─────────────────────────────────────────────────────────────────────┐
│                    TEMPORAL ACTIVITY PATTERN                        │
└─────────────────────────────────────────────────────────────────────┘

  ┌──────────────────┐         ┌──────────────────┐
  │  Temporal Worker │         │   @cognobserve/api│
  │                  │         │                  │
  │  ┌────────────┐  │  tRPC   │  ┌────────────┐  │
  │  │  Activity  │──┼────────▶│  │ internal.  │  │
  │  │            │  │ direct  │  │ procedure  │  │
  │  │ READ-ONLY  │  │  call   │  │            │  │
  │  └────────────┘  │         │  └─────┬──────┘  │
  │        │         │         │        │         │
  └────────┼─────────┘         └────────┼─────────┘
           │ Read only                  │ Mutations
           ▼                            ▼
  ┌──────────────────────────────────────────────┐
  │              PostgreSQL Database              │
  └──────────────────────────────────────────────┘

ALLOWED in Activities:
  ✅ Database READS (findUnique, findMany, count, aggregate)
  ✅ tRPC internal procedure calls (via getInternalCaller())
  ✅ Pure computations and validations

FORBIDDEN in Activities:
  ❌ Database WRITES (create, update, delete, upsert)
  ❌ Direct mutations to any database table
```

### Calling Internal tRPC Procedures from Activities

The worker has a tRPC caller that can directly invoke internal procedures:

```typescript
// apps/worker/src/lib/trpc-caller.ts
import { appRouter, createCallerFactory } from "@cognobserve/api";
import { env } from "./env";

const createCaller = createCallerFactory(appRouter);
let _caller: Caller | null = null;

export function getInternalCaller(): Caller {
  if (!_caller) {
    _caller = createCaller({
      session: null,
      internalSecret: env.INTERNAL_API_SECRET,  // Auth via secret
    });
  }
  return _caller;
}
```

### Activity Implementation Pattern

```typescript
// ❌ BAD - Direct database mutation in activity
export async function persistTrace(input: TraceWorkflowInput): Promise<string> {
  // NEVER do this in Temporal activities!
  const trace = await prisma.trace.create({
    data: { id: input.id, name: input.name },
  });
  return trace.id;
}

// ✅ GOOD - Call tRPC internal procedure for mutations
import { getInternalCaller } from "@/lib/trpc-caller";

export async function persistTrace(input: TraceWorkflowInput): Promise<string> {
  const caller = getInternalCaller();
  const result = await caller.internal.ingestTrace({
    trace: {
      id: input.id,
      projectId: input.projectId,
      name: input.name,
      timestamp: input.timestamp,
    },
    spans: input.spans,
  });
  return result.traceId;
}

// ✅ GOOD - Read-only database operations ARE allowed
export async function getTraceDetails(traceId: string): Promise<TraceDetails | null> {
  // Read operations are fine in activities
  return prisma.trace.findUnique({
    where: { id: traceId },
    select: { id: true, name: true, projectId: true },
  });
}
```

### Adding New Internal Procedures

When adding new mutations that activities need to call:

1. **Add to `packages/api/src/routers/internal.ts`**:
```typescript
export const internalRouter = createRouter({
  // Uses internalProcedure (requires INTERNAL_API_SECRET)
  myNewMutation: internalProcedure
    .input(z.object({ /* schema */ }))
    .mutation(async ({ input }) => {
      // Perform database mutation
      return await prisma.myTable.create({ data: input });
    }),
});
```

2. **Call from activity**:
```typescript
export async function myActivity(data: MyInput): Promise<MyResult> {
  const caller = getInternalCaller();
  return await caller.internal.myNewMutation(data);
}
```

### Available Internal Procedures

| Procedure | Input | Purpose |
|-----------|-------|---------|
| `internal.ingestTrace` | `{ trace, spans }` | Persist trace + spans |
| `internal.calculateTraceCosts` | `{ traceId }` | Calculate span costs |
| `internal.updateCostSummaries` | `{ projectId, date }` | Update daily summaries |
| `internal.ingestScore` | `{ id, projectId, ... }` | Persist score |
| `internal.validateScoreConfig` | `{ configId, value }` | Validate score config |
| `internal.transitionAlertState` | `{ alertId, conditionMet }` | Transition alert state |
| `internal.dispatchNotification` | `{ alertId, state, value, threshold }` | Send notifications |
| `internal.createEvalRun` | `{ suiteId, triggeredBy, ... }` | Create eval run record |
| `internal.updateEvalRun` | `{ runId, status, metrics }` | Update eval run with results |
| `internal.dispatchRegressionAlert` | `{ suiteId, runId, regressionDetails }` | Send regression alert notifications |

### Additional Temporal Details

For detailed information on:
- Workflow input types and imports
- Key Temporal files reference
- ESM compatibility notes
- Step-by-step workflow creation guide

**See `docs/WORKFLOWS.md`**

## Eval Pipeline (Regression Detection)

The Eval Pipeline provides proactive regression detection for AI endpoints. When PRs merge, it automatically runs eval suites and alerts if performance regresses.

### Architecture

```
GitHub PR Merge → Webhook → evalPipelineWorkflow → Eval Prompts → Compare Baseline → Alert
```

### Key Files

| File | Purpose |
|------|---------|
| `packages/db/prisma/schema.prisma` | EvalSuite, EvalRun models |
| `packages/api/src/schemas/eval.ts` | Eval Zod schemas |
| `packages/api/src/routers/evals.ts` | Public eval tRPC router |
| `packages/api/src/routers/internal.ts` | Internal procedures (createEvalRun, updateEvalRun, dispatchRegressionAlert) |
| `apps/worker/src/workflows/eval.workflow.ts` | Eval pipeline workflow |
| `apps/worker/src/temporal/activities/eval.activities.ts` | Eval activities (READ-ONLY pattern) |
| `apps/web/src/app/api/webhooks/github/route.ts` | PR merge detection |

### Eval Workflow Steps

1. **getEvalSuite** - Fetch suite config from DB (READ)
2. **createEvalRun** - Create run via `internal.createEvalRun` (tRPC)
3. **runEvalPrompts** - Execute prompts against endpoint (HTTP)
4. **calculateMetrics** - Compute latency, error rate, pass % (pure)
5. **detectRegression** - Compare metrics to baseline (pure)
6. **storeResults** - Store via `internal.updateEvalRun` (tRPC)
7. **triggerAlert** - If regression, dispatch via `internal.dispatchRegressionAlert` (tRPC)

### Activity Pattern

The eval pipeline follows the same READ-ONLY activity pattern as other workflows:

```typescript
// ✅ GOOD - Read operations in activities
export async function getEvalSuite(suiteId: string): Promise<EvalSuite | null> {
  return prisma.evalSuite.findUnique({ where: { id: suiteId } });
}

// ✅ GOOD - Mutations via tRPC internal caller
export async function createEvalRun(input: CreateRunInput): Promise<string> {
  const caller = getInternalCaller();
  const result = await caller.internal.createEvalRun(input);
  return result.runId;
}

// ❌ FORBIDDEN - Direct database mutations
export async function createEvalRun(input: CreateRunInput): Promise<string> {
  const run = await prisma.evalRun.create({ data: input }); // NEVER DO THIS
  return run.id;
}
```

### Triggers

| Trigger | Source | When |
|---------|--------|------|
| PR Merge | GitHub Webhook | `action === "closed" && pull_request.merged` |
| Manual | tRPC `evals.triggerRun` | User clicks "Run Eval" button |
| Scheduled | Future | Cron-based (not yet implemented) |

### Database Models

- **EvalSuite**: Suite config with prompts, endpoint, baseline thresholds
- **EvalRun**: Individual run with status, metrics, regression details

## Database Migrations (CRITICAL)

**ALWAYS create a migration when editing Prisma schemas.** This is a strict rule.

```bash
# After ANY change to files in packages/db/prisma/schema/*.prisma
pnpm db:migrate --name <descriptive_name>

# Examples:
pnpm db:migrate --name add_knowledge_base
pnpm db:migrate --name add_user_preferences
pnpm db:migrate --name update_alert_thresholds
```

**Migration naming conventions:**
- Use snake_case: `add_knowledge_base`, NOT `addKnowledgeBase`
- Be descriptive: `add_user_avatar_column`, NOT `update`
- Group related changes: `add_eval_suite_knowledge_relation`

**Why this matters:**
- Migrations are version-controlled database changes
- Without migrations, schema changes are lost when others pull
- Production deployments rely on migration files

## LLM Center (CRITICAL)

The LLM Center (`packages/shared/src/llm/`) is the centralized abstraction for all LLM operations. **All LLM calls MUST go through the LLM Center.**

**Full documentation:** [`docs/LLM_CENTER.md`](docs/LLM_CENTER.md)

**IMPORTANT:** When editing any files in `packages/shared/src/llm/`:
1. **Read** `docs/LLM_CENTER.md` first to understand the architecture
2. **Update** `docs/LLM_CENTER.md` if you add/change functionality
3. **Follow** the established patterns for errors, logging, and providers

### Quick Reference

```typescript
// Get LLM instance
import { getLLM } from "@/lib/llm-manager";
const llm = getLLM();

// Operations
await llm.embed(["text"]);                    // Embeddings
await llm.chat([{ role: "user", content }]);  // Chat
await llm.complete(prompt, { schema });       // Structured output
```

### Key Rules

| Rule | Description |
|------|-------------|
| **Single Entry Point** | Always use `getLLM()` - never import SDKs directly |
| **Centralized Errors** | Use `LLMError` subclasses from `@cognobserve/shared/llm` |
| **Centralized Logging** | Use `getLogger()` from `@cognobserve/shared/llm` |
| **Update Docs** | Update `docs/LLM_CENTER.md` when adding features |

### Key Files

| File | Purpose |
|------|---------|
| `docs/LLM_CENTER.md` | Full documentation (READ THIS FIRST) |
| `packages/shared/src/llm/center.ts` | Main LLMCenter class |
| `packages/shared/src/llm/errors.ts` | Centralized error classes |
| `packages/shared/src/llm/utils/logger.ts` | Configurable logger |
| `apps/worker/src/lib/llm-manager.ts` | Singleton accessor for worker |

## Code Style Rules

### No Inline Functions
- **Never use inline arrow functions in JSX** - Extract to named functions or handlers
- Define event handlers outside JSX: `const handleClick = () => {}` not `onClick={() => {}}`
- Extract callbacks passed to hooks: `const fetchData = useCallback(...)` not inline in deps

```tsx
// BAD
<Button onClick={() => setOpen(true)}>Open</Button>
{items.map((item) => <Item key={item.id} {...item} />)}

// GOOD
const handleOpen = () => setOpen(true);
const renderItem = (item: Item) => <Item key={item.id} {...item} />;

<Button onClick={handleOpen}>Open</Button>
{items.map(renderItem)}
```

### Constants
- **Use UPPER_SNAKE_CASE for constants**
- Define constants at module level, not inside components
- For complex/shared constants, create a dedicated `constants.ts` file
- Group related constants in objects when appropriate

```tsx
// Simple constants - top of file
const MAX_ITEMS = 10;
const API_TIMEOUT = 5000;

// Complex constants - separate file (e.g., src/lib/constants.ts)
export const NAV_ITEMS = [
  { title: "Dashboard", href: "/", icon: LayoutDashboard },
  { title: "Projects", href: "/projects", icon: FolderKanban },
] as const;

export const ERROR_MESSAGES = {
  UNAUTHORIZED: "You must be logged in",
  NOT_FOUND: "Resource not found",
} as const;
```

### Zod Schemas as Source of Truth
- **Define types as Zod schemas first** - Infer TypeScript types from schemas
- **Store schemas in `packages/api/src/schemas/`** - Centralized location for shared types
- **Never hardcode constants for enums/unions** - Define as Zod schema, derive constants from it
- **Export both schema and inferred type** - `export const MySchema = z.enum([...]); export type My = z.infer<typeof MySchema>;`
- **Client components**: Import from `@cognobserve/api/schemas` (NOT `@cognobserve/api`) to avoid server-side deps

```typescript
// BAD - Hardcoded constants without schema
export const ADMIN_ROLES = ["OWNER", "ADMIN"] as const;
export const ALL_ROLES = ["OWNER", "ADMIN", "MEMBER", "VIEWER"] as const;

// GOOD - Zod schema as source of truth
// packages/api/src/schemas/roles.ts
import { z } from "zod";

export const ProjectRoleSchema = z.enum(["OWNER", "ADMIN", "MEMBER", "VIEWER"]);
export type ProjectRole = z.infer<typeof ProjectRoleSchema>;

// Derive constants from schema
export const ADMIN_ROLES: readonly ProjectRole[] = ["OWNER", "ADMIN"];
export const ALL_ROLES: readonly ProjectRole[] = ProjectRoleSchema.options;

// Validation helper
export const isValidRole = (role: string): role is ProjectRole => {
  return ProjectRoleSchema.safeParse(role).success;
};

// Client component usage (avoids server-side deps)
import { WORKSPACE_ADMIN_ROLES } from "@cognobserve/api/schemas";
```

### Zod for Runtime Validation (CRITICAL - MANDATORY)
**ALL unknown data MUST be validated through Zod. No exceptions.**

This is a strict enforcement rule. Type assertions (`as`) are FORBIDDEN for unknown data. Every piece of external data entering the system must pass through Zod validation before use.

**The Rule:**
```
Unknown Data → Zod Schema → safeParse() → Use validated data
```

**What counts as unknown data:**
- `fetch()` responses (external APIs, internal APIs)
- `response.json()` results
- `JSON.parse()` output
- WebSocket messages
- URL query parameters
- Environment variables (at runtime)
- Any data crossing trust boundaries

```typescript
// ❌ FORBIDDEN - Type assertion bypasses runtime safety
const response = await fetch("/api/data");
const data = (await response.json()) as { users: User[] };
// NEVER do this - silent runtime failures

// ❌ FORBIDDEN - Manual type checking
const json: unknown = await response.json();
if (typeof json === "object" && json !== null && "users" in json) {
  // Verbose, error-prone, incomplete
}

// ✅ REQUIRED - Zod validation (the ONLY acceptable pattern)
import { z } from "zod";

const ResponseSchema = z.object({
  users: z.array(z.object({
    id: z.string(),
    name: z.string(),
    email: z.string().email(),
  })),
});

const json: unknown = await response.json();
const parsed = ResponseSchema.safeParse(json);

if (!parsed.success) {
  console.error("Validation failed:", parsed.error.flatten());
  return null; // or throw, or return fallback
}

// NOW it's safe to use - fully typed
const data = parsed.data;
```

**Validation requirements by scenario:**
| Scenario | Zod Required? | Notes |
|----------|---------------|-------|
| External API response | ✅ MANDATORY | Always validate `fetch()` responses |
| Internal API response | ✅ MANDATORY | Worker → Web, service → service |
| `JSON.parse()` result | ✅ MANDATORY | Stored JSON, config files |
| WebSocket messages | ✅ MANDATORY | Real-time data from server |
| URL query params | ✅ MANDATORY | User-controlled input |
| GitHub/Webhook payloads | ✅ MANDATORY | Third-party data |
| Form data (tRPC) | ✅ Auto-handled | tRPC validates with input schema |
| Database results | ❌ Not needed | Prisma types are trustworthy |
| Internal function params | ❌ Not needed | TypeScript compile-time safety |

**Standard Zod patterns:**

```typescript
// 1. Define schema with type inference
const UserSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  role: z.enum(["admin", "user"]),
});
type User = z.infer<typeof UserSchema>;

// 2. Define API response schemas
const ApiResponseSchema = z.object({
  success: z.boolean(),
  data: UserSchema.optional(),
  error: z.string().optional(),
});

// 3. ALWAYS use safeParse (preferred - doesn't throw)
const result = ApiResponseSchema.safeParse(json);
if (!result.success) {
  console.error(result.error.flatten());
  return fallbackValue;
}
return result.data;

// 4. Use parse() only when failure should throw
try {
  const data = ApiResponseSchema.parse(json);
} catch (e) {
  if (e instanceof z.ZodError) {
    // Handle validation error
  }
}
```

**Real-world example (GitHub API):**
```typescript
// Define schema for external API
const GitHubContentResponseSchema = z.object({
  size: z.number(),
  content: z.string(),
  encoding: z.string(),
});

// Fetch and validate
const response = await fetch(url);
const json: unknown = await response.json();
const parsed = GitHubContentResponseSchema.safeParse(json);

if (!parsed.success) {
  console.warn("Invalid GitHub response:", parsed.error.flatten());
  return null;
}

const data = parsed.data; // Safe to use
```

## Frontend Engineering Best Practices

**Code like a senior frontend engineer.** Write maintainable, performant, and scalable code. Every component, hook, and utility should be crafted with care.

### Function Decomposition
- **Break large functions into smaller, focused functions** - Each function should do ONE thing well
- **Functions over 20-30 lines are candidates for splitting** - If you need to scroll, it's too long
- **Name functions by what they do, not how** - `validateEmail` not `checkStringForAtSymbol`
- **Pure functions are preferred** - Same input always produces same output, no side effects

```tsx
// BAD - Monolithic function doing too many things
function handleSubmit(data: FormData) {
  const errors: string[] = [];
  if (!data.email) errors.push("Email required");
  if (!data.email.includes("@")) errors.push("Invalid email");
  if (!data.password) errors.push("Password required");
  if (data.password.length < 8) errors.push("Password too short");
  if (!/[A-Z]/.test(data.password)) errors.push("Need uppercase");
  if (!/[0-9]/.test(data.password)) errors.push("Need number");
  if (errors.length > 0) {
    setErrors(errors);
    return;
  }
  setIsLoading(true);
  fetch("/api/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })
    .then((res) => res.json())
    .then((result) => {
      if (result.success) {
        router.push("/dashboard");
      } else {
        setErrors([result.message]);
      }
    })
    .catch(() => setErrors(["Network error"]))
    .finally(() => setIsLoading(false));
}

// GOOD - Decomposed into focused, testable functions
// src/lib/validation/auth.ts
const validateEmail = (email: string): string | null => {
  if (!email) return "Email is required";
  if (!email.includes("@")) return "Invalid email format";
  return null;
};

const validatePassword = (password: string): string[] => {
  const errors: string[] = [];
  if (!password) return ["Password is required"];
  if (password.length < 8) errors.push("Password must be at least 8 characters");
  if (!/[A-Z]/.test(password)) errors.push("Password must contain uppercase letter");
  if (!/[0-9]/.test(password)) errors.push("Password must contain a number");
  return errors;
};

export const validateRegistration = (data: FormData): string[] => {
  const errors: string[] = [];
  const emailError = validateEmail(data.email);
  if (emailError) errors.push(emailError);
  errors.push(...validatePassword(data.password));
  return errors;
};

// src/hooks/use-registration.ts
export function useRegistration() {
  const router = useRouter();
  const [errors, setErrors] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const register = useCallback(async (data: FormData) => {
    const validationErrors = validateRegistration(data);
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }

    setIsLoading(true);
    setErrors([]);

    try {
      const result = await authApi.register(data);
      router.push("/dashboard");
    } catch (error) {
      setErrors([getErrorMessage(error)]);
    } finally {
      setIsLoading(false);
    }
  }, [router]);

  return { register, errors, isLoading };
}

// Component is minimal
function RegistrationForm() {
  const { register, errors, isLoading } = useRegistration();
  const handleSubmit = (data: FormData) => register(data);
  // ... render form
}
```

### Shared Utilities
- **Create reusable utilities in `src/lib/`** - Formatting, validation, API helpers
- **Cross-package utilities go in `packages/shared/`** - Used by multiple apps
- **Group utilities by domain** - `lib/format.ts`, `lib/date.ts`, `lib/validation.ts`
- **Utilities must be pure functions** - No React hooks, no side effects
- **Write utilities once, use everywhere** - DRY principle

```tsx
// BAD - Duplicated formatting logic across components
function TraceCard({ trace }: Props) {
  const duration = trace.endTime - trace.startTime;
  const formatted = duration < 1000
    ? `${duration}ms`
    : duration < 60000
    ? `${(duration / 1000).toFixed(2)}s`
    : `${(duration / 60000).toFixed(2)}m`;
  // ...
}

function SpanRow({ span }: Props) {
  const duration = span.endTime - span.startTime;
  const formatted = duration < 1000
    ? `${duration}ms`
    : duration < 60000
    ? `${(duration / 1000).toFixed(2)}s`
    : `${(duration / 60000).toFixed(2)}m`;  // Duplicated!
  // ...
}

// GOOD - Centralized utility functions
// src/lib/format.ts
export const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  return `${(ms / 60000).toFixed(2)}m`;
};

export const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const formatNumber = (num: number): string => {
  return new Intl.NumberFormat().format(num);
};

export const formatPercentage = (value: number, total: number): string => {
  if (total === 0) return "0%";
  return `${((value / total) * 100).toFixed(1)}%`;
};

// Usage - clean and consistent
function TraceCard({ trace }: Props) {
  const duration = formatDuration(trace.endTime - trace.startTime);
  // ...
}

function SpanRow({ span }: Props) {
  const duration = formatDuration(span.endTime - span.startTime);
  // ...
}
```

### Component Optimization
- **Use React.memo for expensive pure components** - Prevents unnecessary re-renders
- **Use useMemo for expensive computations** - Cache calculated values
- **Use useCallback for stable function references** - Prevent child re-renders
- **Lazy load heavy components** - Code splitting with `React.lazy` and `next/dynamic`
- **Virtualize long lists** - Use `@tanstack/react-virtual` for 100+ items

```tsx
// BAD - Re-renders on every parent render, recalculates on every render
function TraceList({ traces, filter }: Props) {
  // Recalculated every render
  const filteredTraces = traces
    .filter((t) => t.status === filter)
    .sort((a, b) => b.timestamp - a.timestamp);

  // New function reference every render
  const handleTraceClick = (id: string) => {
    router.push(`/traces/${id}`);
  };

  return (
    <div>
      {filteredTraces.map((trace) => (
        <TraceRow
          key={trace.id}
          trace={trace}
          onClick={() => handleTraceClick(trace.id)}
        />
      ))}
    </div>
  );
}

// GOOD - Optimized with memoization and stable references
const TraceRow = memo(function TraceRow({ trace, onClick }: TraceRowProps) {
  return (
    <div onClick={onClick} className="trace-row">
      <span>{trace.name}</span>
      <span>{formatDuration(trace.duration)}</span>
    </div>
  );
});

function TraceList({ traces, filter }: Props) {
  const router = useRouter();

  // Memoize expensive computation
  const filteredTraces = useMemo(() => {
    return traces
      .filter((t) => t.status === filter)
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [traces, filter]);

  // Stable function reference
  const handleTraceClick = useCallback((id: string) => {
    router.push(`/traces/${id}`);
  }, [router]);

  // Create stable onClick handlers
  const getClickHandler = useCallback(
    (id: string) => () => handleTraceClick(id),
    [handleTraceClick]
  );

  return (
    <div>
      {filteredTraces.map((trace) => (
        <TraceRow
          key={trace.id}
          trace={trace}
          onClick={getClickHandler(trace.id)}
        />
      ))}
    </div>
  );
}

// Lazy loading for heavy components
const TraceDetailPanel = dynamic(
  () => import("@/components/trace-detail-panel"),
  { loading: () => <Skeleton className="h-96" /> }
);
```

### Performance Patterns
- **Avoid prop drilling** - Use context or composition for deeply nested data
- **Debounce user inputs** - Search, filters, form fields
- **Throttle scroll/resize handlers** - Prevent excessive calls
- **Use Suspense boundaries** - Graceful loading states
- **Preload critical data** - Use Next.js `prefetch` and React Query `prefetchQuery`

```tsx
// BAD - Uncontrolled re-fetching on every keystroke
function SearchInput({ onSearch }: Props) {
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    onSearch(e.target.value);  // Fires on every keystroke!
  };
  return <Input onChange={handleChange} />;
}

// GOOD - Debounced search with custom hook
// src/hooks/use-debounce.ts
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

// src/components/search-input.tsx
function SearchInput({ onSearch }: Props) {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 300);

  useEffect(() => {
    onSearch(debouncedQuery);
  }, [debouncedQuery, onSearch]);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
  };

  return <Input value={query} onChange={handleChange} />;
}
```

### URL State Synchronization (Panels, Modals, Tabs)
- **Sync UI state to URL query params** - Panels, modals, tabs, and filters should update the URL
- **Read URL params on mount** - Auto-open panels/modals when URL contains relevant params
- **Clear URL params on close** - Remove params when closing panels/modals
- **Enable shareable/bookmarkable state** - Users can share URLs that restore exact UI state

**Why?** This enables:
- Deep linking to specific UI states (e.g., open alerts panel)
- Browser back/forward navigation works correctly
- Sharing URLs that open specific panels or tabs
- Returning from detail pages to the correct state

```tsx
// ❌ BAD - State not reflected in URL
function AlertsPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("alerts");

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      {/* State lost on page refresh or share */}
    </Sheet>
  );
}

// ✅ GOOD - State synced to URL
function AlertsPanel() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("alerts");

  // Read URL params on mount
  useEffect(() => {
    const alertParam = searchParams.get("alert");
    const tabParam = searchParams.get("tab");
    if (alertParam) {
      setIsOpen(true);
      if (tabParam) setActiveTab(tabParam);
    }
  }, [searchParams]);

  // Update URL when state changes
  const handleOpenChange = useCallback((open: boolean) => {
    setIsOpen(open);
    const params = new URLSearchParams(searchParams.toString());

    if (open) {
      params.set("alert", "panel");
      params.set("tab", activeTab);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    } else {
      params.delete("alert");
      params.delete("tab");
      const newUrl = params.toString() ? `${pathname}?${params}` : pathname;
      router.replace(newUrl, { scroll: false });
    }
  }, [searchParams, pathname, router, activeTab]);

  return (
    <Sheet open={isOpen} onOpenChange={handleOpenChange}>
      {/* URL: /projects/123?alert=panel&tab=history */}
    </Sheet>
  );
}
```

**URL patterns by component type:**
| Component | URL Pattern | Example |
|-----------|-------------|---------|
| Side panels | `?alertPanel=open&alertTab=history` | Alerts panel with history tab |
| Modals | `?modal=create-project` | Create project dialog |
| Detail views | `?alertPanel={id}&alertTab=history` | Specific alert in history |
| Filters | `?filter=errors&range=7d` | Trace filters |

**IMPORTANT:** Use unique, namespaced param names to avoid conflicts with page-level params:
- Page uses `?tab=traces` → Panel should use `?alertTab=history` (NOT `?tab=`)
- Use prefixes like `alertPanel`, `alertTab`, `modalType`, etc.

**Back navigation pattern:**
When navigating away from a detail page that should return to a panel state:
```tsx
// In detail page - link back with state
<Link href={`/projects/${projectId}?alertPanel=${alertId}&alertTab=history`}>
  Back to Alert
</Link>
```

### Prevent Race Conditions
- **Never use check-then-act patterns** - Separate find/check + action calls create race conditions
- **Use atomic operations** - Single database call for conditional mutations
- **Use transactions** when multiple operations must succeed or fail together
- **Handle conflicts gracefully** - Catch `RecordNotFound` errors instead of pre-checking

```typescript
// BAD - Race condition between findFirst and delete
const record = await prisma.apiKey.findFirst({ where: { id, projectId } });
if (!record) throw new Error("Not found");
await prisma.apiKey.delete({ where: { id } });

// GOOD - Single atomic operation
try {
  await prisma.apiKey.delete({ where: { id, projectId } });
} catch (e) {
  if (e.code === "P2025") throw new TRPCError({ code: "NOT_FOUND" });
  throw e;
}

// GOOD - Transaction for multiple dependent operations
await prisma.$transaction(async (tx) => {
  const key = await tx.apiKey.findUniqueOrThrow({ where: { id } });
  await tx.auditLog.create({ data: { action: "delete", targetId: key.id } });
  await tx.apiKey.delete({ where: { id } });
});
```

**Go service patterns:**
```go
// BAD - Check then act
exists, _ := repo.Exists(ctx, id)
if !exists { return ErrNotFound }
repo.Delete(ctx, id)  // Another request could delete between check and delete

// GOOD - Atomic with row count check
result, err := repo.Delete(ctx, id)
if result.RowsAffected == 0 { return ErrNotFound }
```

## Architecture Patterns (CRITICAL)

### Shared Type Packages - Single Source of Truth
**ALWAYS use shared type packages.** Never duplicate types across apps. This ensures type safety across the entire monorepo.

```
┌─────────────────────────────────────────────────────────────────────┐
│                    TYPE FLOW (Single Source of Truth)               │
└─────────────────────────────────────────────────────────────────────┘

    proto/*.proto                     packages/db/prisma/schema.prisma
    (API contracts)                   (Database models)
          │                                    │
          ▼                                    ▼
    ┌─────────────┐                    ┌─────────────────┐
    │ buf generate│                    │ prisma generate │
    └─────────────┘                    └─────────────────┘
          │                                    │
          ▼                                    ▼
┌──────────────────────┐              ┌──────────────────────┐
│  @cognobserve/proto  │              │   @cognobserve/db    │
│  (Generated TS/Go)   │              │  (Prisma Client)     │
└──────────────────────┘              └──────────────────────┘
          │                                    │
          │         ┌──────────────────────────┤
          │         │                          │
          ▼         ▼                          ▼
┌──────────────────────┐              ┌──────────────────────┐
│  @cognobserve/api    │              │     apps/web         │
│  (tRPC + Schemas)    │──────────────│   (Next.js App)      │
└──────────────────────┘              └──────────────────────┘
          │
          ▼
┌──────────────────────┐
│ @cognobserve/api/    │  ← Client-safe imports (no server deps)
│     schemas          │
└──────────────────────┘

RULE: Always import from shared packages, NEVER duplicate types!
```

```tsx
// ❌ BAD - Duplicating types in components
interface Project {
  id: string;
  name: string;
  // ... manually defined
}

// ❌ BAD - Importing from wrong package
import { Project } from "@prisma/client";  // Direct Prisma import

// ✅ GOOD - Use shared packages
import { type Project, type Trace, type Span } from "@cognobserve/db";
import { type ProjectRole, ProjectRoleSchema } from "@cognobserve/api/schemas";
import { type IngestRequest } from "@cognobserve/proto";
```

**Available shared packages:**
| Package | Purpose | Example Imports |
|---------|---------|-----------------|
| `@cognobserve/db` | Database types & Prisma client | `Project`, `Trace`, `Span`, `ApiKey`, `prisma` |
| `@cognobserve/api/schemas` | Zod schemas & derived types (client-safe) | `ProjectRoleSchema`, `AlertTypeSchema` |
| `@cognobserve/api` | tRPC routers & server utilities | `appRouter`, `createContext` |
| `@cognobserve/proto` | Protobuf-generated types | `IngestRequest`, `TokenUsage` |
| `@cognobserve/shared` | Cross-app utilities & constants | `ACTIVITY_RETRY`, `APP_NAME`, `chunkCodeFiles` |
| `@cognobserve/shared/llm` | LLM Center (OpenAI wrapper) | `createLLMCenter`, `getLLM` |
| `@cognobserve/shared/cache` | Redis cache (embeddings) | `getEmbeddingCache`, `closeRedis` |

**⚠️ CRITICAL: Temporal Workflow Imports**

Temporal workflows are sandboxed and cannot use non-deterministic modules (OpenAI, Redis, fs, net, etc.).

```typescript
// ❌ BAD - Pulls OpenAI into workflow bundle (breaks determinism)
import { createLLMCenter } from "@cognobserve/shared";  // Main index re-exports LLM

// ✅ GOOD - Import only constants from main package
import { ACTIVITY_RETRY } from "@cognobserve/shared";

// ✅ GOOD - Import LLM/Cache in ACTIVITIES only (not workflows)
import { getLLM } from "@cognobserve/shared/llm";           // Activities only
import { getEmbeddingCache } from "@cognobserve/shared/cache"; // Activities only
```

The main `@cognobserve/shared` index only exports deterministic utilities (constants, pure functions). LLM and Cache are only available via sub-path imports to prevent accidental inclusion in workflow bundles.

### Frontend Architecture

#### File Size Rule
- **Keep files under 150-200 lines** - If larger, split into smaller modules
- **One component per file** - No multiple exports of components
- **One hook per file** - Complex hooks get their own file

#### Directory Structure
```
apps/web/src/
├── app/                      # Next.js App Router pages
│   └── (dashboard)/
│       └── [workspaceSlug]/
│           └── projects/
│               ├── page.tsx           # Page component (thin, orchestrates)
│               └── [projectId]/
│                   └── page.tsx
├── components/
│   ├── ui/                   # shadcn/ui primitives (auto-generated)
│   ├── projects/             # Domain: Project components
│   │   ├── project-card.tsx
│   │   ├── project-list.tsx
│   │   ├── project-form.tsx
│   │   └── project-settings.tsx
│   ├── traces/               # Domain: Trace components
│   │   ├── trace-table.tsx
│   │   ├── trace-detail.tsx
│   │   └── span-tree.tsx
│   ├── alerts/               # Domain: Alert components
│   │   ├── alert-card.tsx
│   │   └── alert-form.tsx
│   └── shared/               # Cross-domain components
│       ├── data-table.tsx
│       ├── page-header.tsx
│       └── empty-state.tsx
├── hooks/
│   ├── use-projects.ts       # Domain: Project hooks
│   ├── use-traces.ts         # Domain: Trace hooks
│   ├── use-alerts.ts         # Domain: Alert hooks
│   ├── use-debounce.ts       # Utility hooks
│   └── use-clipboard.ts
├── lib/
│   ├── errors.ts             # Error handling (toast)
│   ├── success.ts            # Success toasts
│   ├── format.ts             # Formatting utilities
│   ├── env.ts                # Environment variables
│   └── utils.ts              # General utilities
└── types/
    └── index.ts              # App-specific types (extend shared types)
```

#### Component Architecture Pattern
```tsx
// ❌ BAD - Fat component with everything inline
function ProjectPage({ projectId }: Props) {
  const [project, setProject] = useState<Project | null>(null);
  const [traces, setTraces] = useState<Trace[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    // 50 lines of data fetching logic...
  }, [projectId]);

  const handleFilterChange = (e) => { /* ... */ };
  const handleTraceClick = (id) => { /* ... */ };
  const handleExport = () => { /* ... */ };

  // 200+ lines of JSX with inline conditions...
}

// ✅ GOOD - Thin component + domain hook + sub-components
// hooks/use-project-detail.ts
export function useProjectDetail(projectId: string) {
  const { data: project, isLoading, error } = api.project.getById.useQuery({ projectId });
  const { data: traces } = api.trace.list.useQuery({ projectId });

  return { project, traces, isLoading, error };
}

// components/projects/project-detail-page.tsx (< 50 lines)
export function ProjectDetailPage({ projectId }: Props) {
  const { project, traces, isLoading, error } = useProjectDetail(projectId);

  if (error) return <ErrorState error={error} />;
  if (isLoading) return <ProjectDetailSkeleton />;
  if (!project) return <NotFound />;

  return (
    <div className="space-y-6">
      <ProjectHeader project={project} />
      <ProjectMetrics project={project} />
      <TraceList traces={traces} projectId={projectId} />
    </div>
  );
}

// components/projects/project-header.tsx (< 40 lines)
export function ProjectHeader({ project }: { project: Project }) {
  return (
    <PageHeader
      title={project.name}
      description={project.description}
      actions={<ProjectActions project={project} />}
    />
  );
}
```

#### Hook Patterns
```tsx
// ✅ Domain hook - encapsulates all project-related logic
// hooks/use-projects.ts
export function useProjects(workspaceId: string) {
  const utils = api.useUtils();

  const { data: projects, isLoading, error } = api.project.list.useQuery(
    { workspaceId },
    { staleTime: 30_000 }
  );

  const createProject = api.project.create.useMutation({
    onSuccess: (newProject) => {
      projectToast.created(newProject.name);
      utils.project.list.invalidate({ workspaceId });
    },
    onError: showError,
  });

  const deleteProject = api.project.delete.useMutation({
    onSuccess: (_, { name }) => {
      projectToast.deleted(name);
      utils.project.list.invalidate({ workspaceId });
    },
    onError: showError,
  });

  return {
    projects: projects ?? [],
    isLoading,
    error,
    createProject: createProject.mutateAsync,
    deleteProject: deleteProject.mutateAsync,
    isCreating: createProject.isPending,
    isDeleting: deleteProject.isPending,
  };
}

// Component is minimal
function ProjectsPage({ workspaceId }: Props) {
  const { projects, isLoading, createProject, isCreating } = useProjects(workspaceId);
  // Just render, no logic
}
```

### Backend Architecture (API Layer)

#### Directory Structure
```
packages/api/src/
├── routers/
│   ├── index.ts              # Root router (merges all)
│   ├── project.ts            # Project router
│   ├── trace.ts              # Trace router
│   ├── alert.ts              # Alert router
│   └── workspace.ts          # Workspace router
├── services/
│   ├── project.service.ts    # Project business logic
│   ├── trace.service.ts      # Trace business logic
│   ├── alert.service.ts      # Alert business logic
│   └── notification.service.ts
├── schemas/
│   ├── project.ts            # Project Zod schemas
│   ├── trace.ts              # Trace Zod schemas
│   ├── alert.ts              # Alert Zod schemas
│   └── index.ts              # Re-exports all schemas
├── errors/
│   ├── codes.ts              # Error codes
│   └── app-error.ts          # Custom error class
└── trpc.ts                   # tRPC setup
```

#### Router → Service Pattern
Routers are thin. Business logic lives in services.

```tsx
// ❌ BAD - Fat router with business logic
// routers/project.ts
export const projectRouter = router({
  create: protectedProcedure
    .input(CreateProjectSchema)
    .mutation(async ({ ctx, input }) => {
      // 50 lines of validation, business logic, database calls...
      const existing = await ctx.db.project.findFirst({ where: { slug: input.slug } });
      if (existing) throw new TRPCError({ code: "CONFLICT" });

      const project = await ctx.db.project.create({ data: { ...input } });
      await ctx.db.auditLog.create({ data: { ... } });
      await sendNotification({ ... });
      // ...more logic
      return project;
    }),
});

// ✅ GOOD - Thin router + service
// routers/project.ts
import { ProjectService } from "../services/project.service";

export const projectRouter = router({
  create: protectedProcedure
    .input(CreateProjectSchema)
    .mutation(async ({ ctx, input }) => {
      return ProjectService.create(ctx.db, ctx.user, input);
    }),

  getById: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ProjectService.getById(ctx.db, input.projectId, ctx.user);
    }),

  delete: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ProjectService.delete(ctx.db, input.projectId, ctx.user);
    }),
});

// services/project.service.ts
import { type PrismaClient, type Project, type User } from "@cognobserve/db";
import { type CreateProjectInput } from "../schemas/project";
import { AppError } from "../errors/app-error";

export class ProjectService {
  static async create(
    db: PrismaClient,
    user: User,
    input: CreateProjectInput
  ): Promise<Project> {
    // Check permissions
    await this.assertCanCreateProject(db, user, input.workspaceId);

    // Create with transaction
    return db.$transaction(async (tx) => {
      const project = await tx.project.create({
        data: {
          ...input,
          createdById: user.id,
        },
      });

      await tx.auditLog.create({
        data: {
          action: "PROJECT_CREATED",
          userId: user.id,
          resourceId: project.id,
        },
      });

      return project;
    });
  }

  static async getById(
    db: PrismaClient,
    projectId: string,
    user: User
  ): Promise<Project> {
    const project = await db.project.findUnique({
      where: { id: projectId },
      include: { workspace: true },
    });

    if (!project) {
      throw AppError.notFound("PROJECT_NOT_FOUND");
    }

    await this.assertCanAccessProject(db, user, project);
    return project;
  }

  static async delete(
    db: PrismaClient,
    projectId: string,
    user: User
  ): Promise<void> {
    const project = await this.getById(db, projectId, user);
    await this.assertCanDeleteProject(db, user, project);

    await db.project.delete({ where: { id: projectId } });
  }

  // Private helper methods
  private static async assertCanCreateProject(
    db: PrismaClient,
    user: User,
    workspaceId: string
  ): Promise<void> {
    // Permission check logic
  }

  private static async assertCanAccessProject(
    db: PrismaClient,
    user: User,
    project: Project
  ): Promise<void> {
    // Access check logic
  }

  private static async assertCanDeleteProject(
    db: PrismaClient,
    user: User,
    project: Project
  ): Promise<void> {
    // Delete permission check
  }
}
```

#### Schema Organization
```tsx
// schemas/project.ts
import { z } from "zod";

// Input schemas
export const CreateProjectSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/),
  workspaceId: z.string().uuid(),
  description: z.string().max(500).optional(),
});

export const UpdateProjectSchema = CreateProjectSchema.partial().extend({
  projectId: z.string().uuid(),
});

// Derived types
export type CreateProjectInput = z.infer<typeof CreateProjectSchema>;
export type UpdateProjectInput = z.infer<typeof UpdateProjectSchema>;

// Enums
export const ProjectStatusSchema = z.enum(["ACTIVE", "ARCHIVED", "DELETED"]);
export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;
```

### Architecture Checklist

Before submitting code, verify:

**Frontend:**
- [ ] Components are < 150 lines
- [ ] Business logic is in hooks, not components
- [ ] Using shared types from `@cognobserve/db` or `@cognobserve/api/schemas`
- [ ] Domain-specific components are in domain folders
- [ ] No direct `toast()` calls - using `@/lib/errors` and `@/lib/success`

**Backend:**
- [ ] Routers are thin (< 20 lines per procedure)
- [ ] Business logic is in service files
- [ ] Using shared types from `@cognobserve/db`
- [ ] Schemas are in `schemas/` directory
- [ ] Errors use `AppError` with proper codes

**Shared:**
- [ ] No type duplication across packages
- [ ] Types flow: `proto/*.proto` → `@cognobserve/proto` → `@cognobserve/db` → apps
- [ ] Zod schemas are source of truth for input validation

## UI Components (shadcn/ui)

### Setup
- **Theme**: Yellow (defined in `apps/web/src/app/globals.css`)
- **Style**: new-york
- **Components**: `apps/web/src/components/ui/`
- **Config**: `apps/web/components.json`

### Best Practices
- **ALWAYS use shadcn/ui components** - Never create custom CSS for buttons, inputs, cards, dialogs, etc.
- **Use semantic color variables** - `primary`, `secondary`, `muted`, `accent`, `destructive`
- **Extend, don't override** - Use `cn()` utility to merge classes
- **Available components**: button, card, input, label, form, sonner, dialog, dropdown-menu, table, tabs, avatar, badge, separator, skeleton

### Usage Examples
```tsx
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"

<Button variant="default">Primary</Button>   // Yellow theme
<Button variant="destructive">Delete</Button>
<Button variant="outline">Outlined</Button>

<Card>
  <CardHeader><CardTitle>Title</CardTitle></CardHeader>
  <CardContent>Content</CardContent>
</Card>
```

## API Endpoints

### Ingest Service (Node.js)
- `GET /health` - Health check
- `GET /metrics` - Prometheus metrics
- `POST /v1/traces` - Ingest OTLP traces (JSON or protobuf, gzip supported)

## Toast & Error Handling (CRITICAL)

### Source of Truth - Two Unified Files
All toast notifications in the application MUST use these two centralized files:
- **Errors**: `apps/web/src/lib/errors.ts` - All error toasts, error extraction, and error messages
- **Success**: `apps/web/src/lib/success.ts` - All success, info, and warning toasts

### NEVER Import or Use `toast` from "sonner" Directly
This is a **strict rule**. Never import `toast` from "sonner" in components or hooks. Always use the centralized utilities.

```tsx
// ❌ BAD - Direct toast import (FORBIDDEN)
import { toast } from "sonner";

function MyComponent() {
  const handleSave = async () => {
    try {
      await saveData();
      toast.success("Saved!");  // ❌ NEVER do this
    } catch (error) {
      toast.error("Failed to save");  // ❌ NEVER do this
    }
  };
}

// ❌ BAD - Inline toast messages
toast.success("Project created", { description: "Your project is ready." });
toast.error("Something went wrong", { description: "Please try again." });
toast.info("Processing...");
toast.warning("This action cannot be undone");

// ✅ GOOD - Use centralized utilities
import { showError, projectError } from "@/lib/errors";
import { projectToast, showSuccess, showInfo, showWarning } from "@/lib/success";

function MyComponent() {
  const handleSave = async () => {
    try {
      await saveData();
      projectToast.created("My Project");  // ✅ Domain-specific
    } catch (error) {
      showError(error);  // ✅ Auto-extracts error info
    }
  };
}
```

### Complete Usage Examples

#### Handling tRPC/API Mutations
```tsx
import { showError } from "@/lib/errors";
import { projectToast } from "@/lib/success";

function CreateProjectForm() {
  const createProject = api.project.create.useMutation({
    onSuccess: (project) => {
      projectToast.created(project.name);  // ✅
      router.push(`/projects/${project.id}`);
    },
    onError: (error) => {
      showError(error);  // ✅ Handles tRPC errors automatically
    },
  });
}
```

#### Try-Catch Pattern
```tsx
import { showError, memberError } from "@/lib/errors";
import { memberToast } from "@/lib/success";

const handleAddMember = async (email: string) => {
  try {
    await addMember.mutateAsync({ email });
    memberToast.added(email);  // ✅
  } catch (error) {
    // Option 1: Generic error handling
    showError(error);  // ✅ Auto-extracts title & message

    // Option 2: Specific error based on code
    const errorInfo = extractErrorInfo(error);
    if (errorInfo.code === "USER_NOT_FOUND") {
      memberError.notFound(email);  // ✅ Domain-specific
    } else {
      showError(error);
    }
  }
};
```

#### Generic Toasts (Non-Domain-Specific)
```tsx
import { showSuccess, showInfo, showWarning } from "@/lib/success";
import { showErrorMessage } from "@/lib/errors";

// Success
showSuccess("Settings saved");
showSuccess("Changes applied", "Your preferences have been updated.");

// Info
showInfo("Processing", "This may take a moment.");

// Warning
showWarning("Rate limit approaching", "You've used 80% of your quota.");

// Error with custom message
showErrorMessage("Upload failed", "The file exceeds the 10MB limit.");
```

#### Clipboard Operations
```tsx
import { clipboardToast } from "@/lib/success";

const handleCopy = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    clipboardToast.copied("API key");  // ✅
  } catch {
    clipboardToast.copyFailed();  // ✅ (Note: copyFailed is in success.ts)
  }
};
```

### Available Toast Utilities

**Success toasts** (`@/lib/success`):
| Object | Methods |
|--------|---------|
| `showSuccess(title, message?)` | Generic success toast |
| `showCreated(resource, details?)` | Resource created |
| `showUpdated(resource, details?)` | Resource updated |
| `showDeleted(resource, details?)` | Resource deleted |
| `showInfo(title, message?)` | Info toast |
| `showWarning(title, message?)` | Warning toast |
| `workspaceToast` | `.created(name)`, `.updated(name)`, `.deleted(name)` |
| `memberToast` | `.added(email)`, `.removed(email)`, `.roleUpdated(email, role)`, `.inviteSent(email)` |
| `domainToast` | `.added(domain)`, `.removed(domain)` |
| `projectToast` | `.created(name)`, `.updated(name)`, `.deleted(name)` |
| `apiKeyToast` | `.created(name)`, `.revoked(name)`, `.copied()` |
| `authToast` | `.signedIn()`, `.signedOut()`, `.passwordChanged()` |
| `clipboardToast` | `.copied(what?)`, `.copyFailed()` |
| `alertToast` | `.created(name)`, `.updated(name?)`, `.deleted(name?)`, `.channelAdded(provider)`, `.testSent()` |

**Error toasts** (`@/lib/errors`):
| Object | Methods |
|--------|---------|
| `showError(error)` | Auto-extracts and shows error (returns ErrorDisplay) |
| `showErrorMessage(title, message?)` | Custom error toast |
| `extractErrorInfo(error)` | Extract error info without showing toast |
| `memberError` | `.notFound(email?)`, `.alreadyMember(email?)`, `.cannotRemoveSelf()`, `.cannotRemoveOwner()` |
| `domainError` | `.alreadyExists(domain)`, `.invalidFormat()` |
| `workspaceError` | `.notFound()`, `.noAccess()`, `.slugTaken(slug)` |
| `projectError` | `.notFound()`, `.noAccess()` |
| `apiKeyError` | `.notFound()`, `.expired()` |
| `authError` | `.unauthorized()`, `.sessionExpired()`, `.invalidCredentials()` |
| `formError` | `.validation(message?)`, `.required(fieldName)` |
| `alertError` | `.notFound()`, `.testFailed(reason?)`, `.channelFailed(provider)` |

### Adding New Toast Messages
1. **Identify the domain** - Is it for workspace, member, project, alert, etc.?
2. **Add to the correct file**:
   - Success/info/warning → `apps/web/src/lib/success.ts`
   - Error → `apps/web/src/lib/errors.ts`
3. **Follow existing patterns**:
   ```tsx
   // In success.ts - add to existing object or create new
   export const newDomainToast = {
     created: (name: string) =>
       toast.success("Domain created", { description: `"${name}" is ready.` }),
   } as const;

   // In errors.ts - add to existing object or create new
   export const newDomainError = {
     notFound: () =>
       toast.error("Domain Not Found", { description: "This domain doesn't exist." }),
   } as const;
   ```
4. **Use consistent naming**: `{domain}Toast` for success, `{domain}Error` for errors
5. **Export from the file** so it can be imported elsewhere

## API Responses (CRITICAL)

**NEVER use `NextResponse.json()` directly.** Always use centralized response utilities.

**Full documentation:** [`docs/api-responses.md`](docs/api-responses.md)

### Quick Reference

```typescript
import { apiError, apiSuccess, apiServerError } from "@/lib/api-responses";

// Success
return apiSuccess.ok({ data: result });
return apiSuccess.created(newUser);

// Errors
return apiError.unauthorized();
return apiError.notFound("User");
return apiServerError.internal();
```

### Files
- `apps/web/src/lib/api-responses.ts` - REST API responses
- `apps/web/src/lib/webhook-responses.ts` - Webhook responses

### Adding New API Responses
When adding new response methods:
1. Add to the appropriate object in `api-responses.ts` or `webhook-responses.ts`
2. **Update [`docs/api-responses.md`](docs/api-responses.md)** to document the new method
3. Follow existing patterns (use `json()` helper, include error codes)

## Quick Reference for Claude

### Key Locations
- **Proto definitions**: `proto/cognobserve/v1/` → run `make proto` after edits
- **Database schema**: `packages/db/prisma/schema.prisma`
- **Ingest service**: `apps/ingest-node/` (Express, OTLP ingestion)
- **Full documentation**: `/docs` folder

### Critical Rules (MUST Follow)
| Rule | What to Do | What NOT to Do |
|------|-----------|----------------|
| **Types** | Import from `@cognobserve/db`, `@cognobserve/api/schemas`, `@cognobserve/proto` | Duplicate types, import from `@prisma/client` |
| **Unknown Data** | Use Zod `safeParse()` for API responses, JSON parsing | Type assertions (`as`), manual type checking |
| **Toasts** | Use `@/lib/errors` and `@/lib/success` | Import `toast` from "sonner" directly |
| **API Responses** | Use `@/lib/api-responses` and `@/lib/webhook-responses` | Use `NextResponse.json()` directly |
| **UI** | Use shadcn/ui from `@/components/ui/` | Write custom CSS for standard elements |
| **Env vars** | Use `env` from `@/lib/env` | Use `process.env` directly |
| **Frontend** | < 150 lines, logic in hooks, domain folders | Fat components, inline business logic |
| **URL State** | Sync panels/modals/tabs to URL query params | Local state only for shareable UI |
| **Backend** | Thin routers + service files | Business logic in routers |
| **Temporal** | Activities use `getInternalCaller()` for mutations | Direct DB writes in activities |
| **Migrations** | Run `pnpm db:migrate --name <name>` after editing Prisma schemas | Edit schemas without creating migration |
| **Competitors** | Use "industry standard" or "similar platforms" | Name specific competitors |

### No Competitor Names (STRICT)
**NEVER mention competitor company or product names** in code, documentation, specs, or comments. This includes but is not limited to:
- Other observability/monitoring platforms
- Similar open-source projects
- Alternative SaaS products

**Instead of naming competitors:**
- Use "industry standard" or "industry best practices"
- Use "similar platforms" or "comparable solutions"
- Use "common patterns" or "typical implementations"
- Focus on CognObserve's own features and roadmap

```markdown
# ❌ BAD
"Similar to Langfuse, we support..."
"Unlike Datadog, our approach..."
"Competitors like PostHog offer..."

# ✅ GOOD
"Following industry best practices, we support..."
"Our unique approach provides..."
"Similar platforms typically offer..."
```

### Adding Components
```bash
pnpm dlx shadcn@latest add <component>  # Run from apps/web/
```
