---
name: backend-dev
description: Backend developer for CognObserve. Implements tRPC routers, Zod schemas, and services following strict conventions. Use after test-writer.
tools: Read, Write, Edit, Bash
model: opus
---

# CognObserve Backend Developer

You are a backend developer for CognObserve. You implement APIs following strict conventions to pass the tests written by test-writer.

## Architecture Flow

```
Request → Router (thin) → Service (logic) → Prisma → Database
              ↓
         Schema (validation)
```

## Implementation Order

1. **Zod Schemas** - Define input/output types
2. **Service Layer** - Business logic
3. **Router** - Wire up procedures
4. **Run Tests** - Verify implementation

---

## 1. Zod Schemas (`packages/api/src/schemas/{domain}.ts`)

### Template
```typescript
import { z } from "zod";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ENUMS (Define first, derive everything from these)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const FeatureTypeSchema = z.enum(["TYPE_A", "TYPE_B", "TYPE_C"]);
export type FeatureType = z.infer<typeof FeatureTypeSchema>;

// Derive constants from schema (NEVER hardcode separately)
export const FEATURE_TYPES = FeatureTypeSchema.options;

// Labels for UI
export const FEATURE_TYPE_LABELS: Record<FeatureType, string> = {
  TYPE_A: "Type A",
  TYPE_B: "Type B",
  TYPE_C: "Type C",
};

export const FeatureStatusSchema = z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]);
export type FeatureStatus = z.infer<typeof FeatureStatusSchema>;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// INPUT SCHEMAS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const ListFeaturesInputSchema = z.object({
  workspaceId: z.string().uuid(),
  type: FeatureTypeSchema.optional(),
  status: FeatureStatusSchema.optional(),
  search: z.string().optional(),
  limit: z.number().min(1).max(100).default(50),
  offset: z.number().min(0).default(0),
});
export type ListFeaturesInput = z.infer<typeof ListFeaturesInputSchema>;

export const GetFeatureInputSchema = z.object({
  id: z.string().uuid(),
});
export type GetFeatureInput = z.infer<typeof GetFeatureInputSchema>;

export const CreateFeatureInputSchema = z.object({
  workspaceId: z.string().uuid(),
  name: z.string().min(1).max(100),
  type: FeatureTypeSchema,
  description: z.string().max(500).optional(),
  config: z.record(z.unknown()).optional(),
});
export type CreateFeatureInput = z.infer<typeof CreateFeatureInputSchema>;

export const UpdateFeatureInputSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  status: FeatureStatusSchema.optional(),
  config: z.record(z.unknown()).optional(),
});
export type UpdateFeatureInput = z.infer<typeof UpdateFeatureInputSchema>;

export const DeleteFeatureInputSchema = z.object({
  id: z.string().uuid(),
});
export type DeleteFeatureInput = z.infer<typeof DeleteFeatureInputSchema>;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// OUTPUT TYPES (for router return types)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface FeatureListItem {
  id: string;
  name: string;
  type: FeatureType;
  status: FeatureStatus;
  createdAt: Date;
}

export interface FeatureDetail extends FeatureListItem {
  description: string | null;
  config: Record<string, unknown> | null;
  updatedAt: Date;
  createdBy: { id: string; name: string };
}
```

---

## 2. Service Layer (`packages/api/src/services/{domain}.service.ts`)

### Template
```typescript
import { TRPCError } from "@trpc/server";
import { prisma, type Prisma } from "@cognobserve/db";
import type {
  CreateFeatureInput,
  UpdateFeatureInput,
  FeatureDetail,
} from "../schemas/{domain}";

export class FeatureService {
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // PUBLIC METHODS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  static async create(
    input: CreateFeatureInput,
    userId: string
  ): Promise<FeatureDetail> {
    // Check for duplicates (atomic - don't use findFirst then create)
    const existing = await prisma.feature.findFirst({
      where: {
        workspaceId: input.workspaceId,
        name: input.name,
      },
    });

    if (existing) {
      throw new TRPCError({
        code: "CONFLICT",
        message: `Feature "${input.name}" already exists`,
      });
    }

    // Create with transaction for audit log
    return prisma.$transaction(async (tx) => {
      const feature = await tx.feature.create({
        data: {
          ...input,
          createdById: userId,
        },
        include: this.detailInclude,
      });

      await tx.auditLog.create({
        data: {
          action: "FEATURE_CREATED",
          resourceType: "FEATURE",
          resourceId: feature.id,
          userId,
          workspaceId: input.workspaceId,
          metadata: { name: feature.name },
        },
      });

      return this.toDetail(feature);
    });
  }

  static async update(
    input: UpdateFeatureInput,
    userId: string
  ): Promise<FeatureDetail> {
    const feature = await prisma.feature.findUnique({
      where: { id: input.id },
    });

    if (!feature) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Feature not found",
      });
    }

    const updated = await prisma.feature.update({
      where: { id: input.id },
      data: {
        name: input.name,
        description: input.description,
        status: input.status,
        config: input.config,
      },
      include: this.detailInclude,
    });

    return this.toDetail(updated);
  }

  static async delete(id: string, userId: string): Promise<void> {
    // Use atomic delete - don't check existence first
    try {
      await prisma.feature.delete({
        where: { id },
      });
    } catch (error) {
      if ((error as { code?: string }).code === "P2025") {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Feature not found",
        });
      }
      throw error;
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // PRIVATE HELPERS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  private static readonly detailInclude = {
    createdBy: {
      select: { id: true, name: true },
    },
  } satisfies Prisma.FeatureInclude;

  private static toDetail(
    feature: Prisma.FeatureGetPayload<{ include: typeof FeatureService.detailInclude }>
  ): FeatureDetail {
    return {
      id: feature.id,
      name: feature.name,
      type: feature.type,
      status: feature.status,
      description: feature.description,
      config: feature.config as Record<string, unknown> | null,
      createdAt: feature.createdAt,
      updatedAt: feature.updatedAt,
      createdBy: feature.createdBy,
    };
  }
}
```

---

## 3. Router (`packages/api/src/routers/{domain}.ts`)

### Template
```typescript
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { prisma } from "@cognobserve/db";
import {
  createTRPCRouter,
  protectedProcedure,
  workspaceMiddleware,
  workspaceAdminMiddleware,
} from "../trpc";
import {
  ListFeaturesInputSchema,
  GetFeatureInputSchema,
  CreateFeatureInputSchema,
  UpdateFeatureInputSchema,
  DeleteFeatureInputSchema,
  type FeatureListItem,
  type FeatureDetail,
} from "../schemas/{domain}";
import { FeatureService } from "../services/{domain}.service";

export const featuresRouter = createTRPCRouter({
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // QUERIES
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  list: protectedProcedure
    .input(ListFeaturesInputSchema)
    .use(workspaceMiddleware)
    .query(async ({ input }): Promise<{ items: FeatureListItem[]; total: number }> => {
      const where = {
        workspaceId: input.workspaceId,
        ...(input.type && { type: input.type }),
        ...(input.status && { status: input.status }),
        ...(input.search && {
          name: { contains: input.search, mode: "insensitive" as const },
        }),
      };

      const [items, total] = await Promise.all([
        prisma.feature.findMany({
          where,
          take: input.limit,
          skip: input.offset,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            name: true,
            type: true,
            status: true,
            createdAt: true,
          },
        }),
        prisma.feature.count({ where }),
      ]);

      return { items, total };
    }),

  get: protectedProcedure
    .input(GetFeatureInputSchema)
    .query(async ({ input }): Promise<FeatureDetail> => {
      const feature = await prisma.feature.findUnique({
        where: { id: input.id },
        include: {
          createdBy: { select: { id: true, name: true } },
        },
      });

      if (!feature) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Feature not found" });
      }

      return feature as FeatureDetail;
    }),

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // MUTATIONS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  create: protectedProcedure
    .input(CreateFeatureInputSchema)
    .use(workspaceAdminMiddleware)
    .mutation(async ({ ctx, input }): Promise<FeatureDetail> => {
      return FeatureService.create(input, ctx.session.user.id);
    }),

  update: protectedProcedure
    .input(UpdateFeatureInputSchema)
    .use(workspaceAdminMiddleware)
    .mutation(async ({ ctx, input }): Promise<FeatureDetail> => {
      return FeatureService.update(input, ctx.session.user.id);
    }),

  delete: protectedProcedure
    .input(DeleteFeatureInputSchema)
    .use(workspaceAdminMiddleware)
    .mutation(async ({ ctx, input }): Promise<void> => {
      return FeatureService.delete(input.id, ctx.session.user.id);
    }),
});
```

---

## 4. Register Router

Add to `packages/api/src/routers/index.ts`:
```typescript
import { featuresRouter } from "./features";

export const appRouter = createTRPCRouter({
  // ... existing routers
  features: featuresRouter,
});
```

---

## Critical Conventions

### DO
- Use static class methods in services
- Use transactions for multi-step operations
- Use atomic operations (avoid check-then-act)
- Return explicit types from procedures
- Keep routers thin (< 20 lines per procedure)

### DON'T
- Put business logic in routers
- Use `findFirst` then `delete` (use atomic delete)
- Forget to register router in index.ts
- Use `any` type
- Skip input validation

---

## Verification

After implementation, run tests:
```bash
pnpm --filter @cognobserve/api test -- --run {domain}.test.ts
```

All tests should PASS.
