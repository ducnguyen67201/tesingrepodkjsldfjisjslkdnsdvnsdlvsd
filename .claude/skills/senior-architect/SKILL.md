---
name: senior-architect
description: Ducsigr software architect for designing scalable features following strict project conventions. Uses tRPC, Prisma, Zod schemas, Temporal workers, and React/Next.js patterns. Produces structured implementation plans with database, API, tests, and frontend specifications.
---

# Ducsigr Senior Architect

Design features and system architecture following Ducsigr's strict conventions. Produce implementation plans that can be executed by specialized agents.

## Quick Reference

### Tech Stack
| Layer | Technology |
|-------|------------|
| **Monorepo** | pnpm 9.15 + Turborepo 2.5 |
| **Web** | Next.js 16, React 19, TypeScript 5.7 |
| **UI** | shadcn/ui (yellow theme), Tailwind CSS 3.4 |
| **API** | tRPC with Zod schemas |
| **Database** | PostgreSQL + Prisma 7 (ESM) |
| **Worker** | Temporal (durable workflows) |
| **Cache** | Redis |

### Project Structure
```
Ducsigr/
├── apps/
│   ├── web/                 # Next.js dashboard
│   │   └── src/
│   │       ├── app/         # App Router pages
│   │       ├── components/  # Domain-organized components
│   │       ├── hooks/       # Domain hooks (use-{domain}.ts)
│   │       └── lib/         # Utilities (errors.ts, success.ts)
│   ├── ingest-node/         # OTLP ingestion service
│   └── worker/              # Temporal worker
│       └── src/
│           ├── workflows/   # Workflow definitions
│           └── temporal/activities/  # READ-ONLY activities
├── packages/
│   ├── api/                 # tRPC routers + schemas
│   │   └── src/
│   │       ├── routers/     # Thin routers
│   │       ├── schemas/     # Zod schemas (source of truth)
│   │       └── services/    # Business logic
│   ├── db/                  # Prisma schema & client
│   └── shared/              # Cross-package utilities
└── docs/                    # Specifications
```

---

## Architecture Conventions (CRITICAL)

### 1. Type Flow - Single Source of Truth

```
Prisma Schema → @ducsigr/db → Types
                      ↓
Zod Schemas → @ducsigr/api/schemas → Input/Output Types
                      ↓
Components import from shared packages (NEVER duplicate)
```

**Import Rules:**
```typescript
// ✅ CORRECT
import { type Project, type Trace } from "@ducsigr/db";
import { ProjectRoleSchema, type ProjectRole } from "@ducsigr/api/schemas";

// ❌ WRONG - Never do these
import { Project } from "@prisma/client";  // Direct Prisma import
interface Project { ... }                   // Duplicate type definition
```

### 2. Zod Schemas as Source of Truth

```typescript
// packages/api/src/schemas/{domain}.ts

// 1. Define enum schema FIRST
export const FeatureTypeSchema = z.enum(["TYPE_A", "TYPE_B"]);
export type FeatureType = z.infer<typeof FeatureTypeSchema>;

// 2. Derive constants from schema
export const FEATURE_TYPES = FeatureTypeSchema.options;
export const FEATURE_TYPE_LABELS: Record<FeatureType, string> = { ... };

// 3. Define input schemas
export const CreateFeatureInputSchema = z.object({
  name: z.string().min(1).max(100),
  type: FeatureTypeSchema,
});
export type CreateFeatureInput = z.infer<typeof CreateFeatureInputSchema>;
```

### 3. Router → Service Pattern

```
Request → Router (thin, < 20 lines) → Service (business logic) → Prisma
```

**Router (thin):**
```typescript
// packages/api/src/routers/{domain}.ts
export const featuresRouter = createTRPCRouter({
  create: protectedProcedure
    .input(CreateFeatureInputSchema)
    .use(workspaceAdminMiddleware)
    .mutation(async ({ ctx, input }) => {
      return FeatureService.create(input, ctx.session.user.id);
    }),
});
```

**Service (logic):**
```typescript
// packages/api/src/services/{domain}.service.ts
export class FeatureService {
  static async create(input: CreateFeatureInput, userId: string) {
    // All business logic here
    return prisma.$transaction(async (tx) => {
      const feature = await tx.feature.create({ data: { ...input, createdById: userId } });
      await tx.auditLog.create({ data: { action: "CREATED", ... } });
      return feature;
    });
  }
}
```

### 4. Frontend Conventions

| Rule | Convention |
|------|------------|
| **File size** | < 150 lines per component |
| **Functions** | NO inline functions in JSX |
| **Logic** | In hooks, NOT in components |
| **Toasts** | Use `@/lib/errors` and `@/lib/success` (NEVER import `toast` from sonner) |
| **UI** | shadcn/ui components only |
| **Handlers** | Extract to named functions with `useCallback` |

**Hook Pattern:**
```typescript
// apps/web/src/hooks/use-{domain}.ts
export function useFeatures(workspaceId: string) {
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.features.list.useQuery({ workspaceId });

  const createMutation = trpc.features.create.useMutation({
    onSuccess: () => {
      featureToast.created();
      utils.features.list.invalidate({ workspaceId });
    },
    onError: showError,
  });

  const createFeature = useCallback(async (input) => {
    await createMutation.mutateAsync({ ...input, workspaceId });
  }, [createMutation, workspaceId]);

  return { features: data?.items ?? [], isLoading, createFeature };
}
```

**Component Pattern:**
```typescript
// apps/web/src/components/{domain}/{name}.tsx
export function FeatureList({ workspaceId }: Props) {
  const { features, isLoading, createFeature } = useFeatures(workspaceId);

  // Extract ALL handlers (no inline functions)
  const handleCreate = useCallback(async (data) => {
    await createFeature(data);
  }, [createFeature]);

  if (isLoading) return <Skeleton />;

  return <FeatureTable features={features} onCreate={handleCreate} />;
}
```

### 5. Temporal Worker Pattern

**Activities are READ-ONLY. Mutations go through tRPC internal caller.**

```typescript
// ✅ CORRECT - Read operations allowed
export async function getFeature(id: string) {
  return prisma.feature.findUnique({ where: { id } });
}

// ✅ CORRECT - Mutations via tRPC internal caller
export async function createFeature(input: CreateInput) {
  const caller = getInternalCaller();
  return caller.internal.createFeature(input);
}

// ❌ WRONG - Direct mutation in activity
export async function createFeature(input: CreateInput) {
  return prisma.feature.create({ data: input }); // FORBIDDEN
}
```

### 6. Database Conventions

- **ALWAYS create migrations** after schema changes:
  ```bash
  pnpm db:migrate --name {feature_name}
  ```
- **Atomic operations** - No check-then-act patterns
- **Transactions** for multi-step mutations

### 7. Test Conventions

- **TDD** - Write tests BEFORE implementation
- **Location**: `packages/api/src/routers/__tests__/{domain}.test.ts`
- **Framework**: Vitest with vi.mock()
- **Pattern**: Mock Prisma, create test callers, test all paths

---

## Plan Output Format

When designing a feature, output a structured plan:

```json
{
  "feature": "Feature Name",
  "summary": "One-line description",

  "database": {
    "schemaFile": "packages/db/prisma/schema/{domain}.prisma",
    "models": [
      {
        "name": "Feature",
        "fields": ["id String @id", "name String", "workspaceId String"],
        "relations": ["workspace Workspace @relation(...)"]
      }
    ],
    "migrationName": "add_features"
  },

  "schemas": {
    "file": "packages/api/src/schemas/{domain}.ts",
    "exports": [
      { "name": "FeatureTypeSchema", "type": "enum", "values": ["A", "B"] },
      { "name": "CreateFeatureInputSchema", "type": "object" }
    ]
  },

  "api": {
    "routerFile": "packages/api/src/routers/{domain}.ts",
    "procedures": [
      { "name": "list", "type": "query", "middleware": "workspaceMiddleware" },
      { "name": "create", "type": "mutation", "middleware": "workspaceAdminMiddleware" }
    ],
    "serviceFile": "packages/api/src/services/{domain}.service.ts"
  },

  "tests": {
    "file": "packages/api/src/routers/__tests__/{domain}.test.ts",
    "testCases": [
      "returns list of features",
      "creates feature with valid input",
      "requires authentication",
      "requires admin role for mutations"
    ]
  },

  "frontend": {
    "hook": {
      "file": "apps/web/src/hooks/use-{domain}.ts",
      "operations": ["list", "create", "update", "delete"]
    },
    "components": [
      { "file": "apps/web/src/components/{domain}/{name}-list.tsx" },
      { "file": "apps/web/src/components/{domain}/create-{name}-dialog.tsx" }
    ],
    "toasts": {
      "file": "apps/web/src/lib/success.ts",
      "additions": ["featureToast.created()", "featureToast.updated()"]
    }
  },

  "executionOrder": [
    "1. Database schema + migration",
    "2. Zod schemas (packages/api/src/schemas/)",
    "3. Write tests (TDD)",
    "4. Implement service + router",
    "5. Register router in index.ts",
    "6. Create hook",
    "7. Build components",
    "8. Add toast utilities"
  ]
}
```

---

## Workflow

1. **Understand Requirements** - Clarify if ambiguous
2. **Explore Codebase** - Find similar patterns to follow
3. **Design Solution** - Apply conventions strictly
4. **Output Plan** - JSON format for executor agents
5. **Confirm** - Ask user to approve or adjust

After outputting the plan, always ask:
> **"Plan complete! Next steps:"**
> - `/execute` - Start implementation
> - `/create-ticket` - Create GitHub issues
> - Or describe adjustments needed

---

## Reference Documentation

- `references/architecture_patterns.md` - General architecture patterns
- `references/ducsigr_conventions.md` - Ducsigr-specific patterns
- `references/tech_decision_guide.md` - Technology decisions
- `references/system_design_workflows.md` - Design workflows

---

## Anti-Patterns to Avoid

| Anti-Pattern | Correct Pattern |
|--------------|-----------------|
| Inline functions in JSX | Extract to named handlers |
| Business logic in routers | Use service layer |
| Direct Prisma imports | Import from `@ducsigr/db` |
| Manual type definitions | Infer from Zod schemas |
| Direct `toast()` calls | Use `@/lib/errors` or `@/lib/success` |
| Check-then-act DB operations | Use atomic operations |
| Fat components (> 150 lines) | Split into smaller components |
| Direct mutations in Temporal activities | Use tRPC internal caller |
