# CognObserve Conventions Reference

## Overview

This document contains all CognObserve-specific patterns and conventions. These are strictly enforced across the codebase.

---

## 1. Schema Patterns

### Zod Schema Organization

Every domain has a schema file in `packages/api/src/schemas/{domain}.ts`:

```typescript
import { z } from "zod";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ENUMS (Define first - these are the source of truth)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const ExtensionTypeSchema = z.enum([
  "INGESTION_HANDLER",
  "THEME",
  "DASHBOARD",
]);
export type ExtensionType = z.infer<typeof ExtensionTypeSchema>;

// Derive constants from schema (NEVER hardcode separately)
export const EXTENSION_TYPES = ExtensionTypeSchema.options;

// Labels for UI dropdowns
export const EXTENSION_TYPE_LABELS: Record<ExtensionType, string> = {
  INGESTION_HANDLER: "Ingestion Handler",
  THEME: "Theme",
  DASHBOARD: "Dashboard",
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// INPUT SCHEMAS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const ListExtensionsInputSchema = z.object({
  workspaceId: z.string().uuid(),
  type: ExtensionTypeSchema.optional(),
  limit: z.number().min(1).max(100).default(50),
  offset: z.number().min(0).default(0),
});
export type ListExtensionsInput = z.infer<typeof ListExtensionsInputSchema>;

export const CreateExtensionInputSchema = z.object({
  workspaceId: z.string().uuid(),
  name: z.string().min(1).max(100),
  type: ExtensionTypeSchema,
  config: z.record(z.unknown()).optional(),
});
export type CreateExtensionInput = z.infer<typeof CreateExtensionInputSchema>;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// OUTPUT TYPES (for router return types)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface ExtensionListItem {
  id: string;
  name: string;
  type: ExtensionType;
  createdAt: Date;
}
```

---

## 2. Router Patterns

### Thin Router Structure

Routers are thin - all business logic goes in services:

```typescript
// packages/api/src/routers/{domain}.ts
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
  ListExtensionsInputSchema,
  CreateExtensionInputSchema,
  type ExtensionListItem,
} from "../schemas/extensions";
import { ExtensionService } from "../services/extension.service";

export const extensionsRouter = createTRPCRouter({
  // Queries use workspaceMiddleware
  list: protectedProcedure
    .input(ListExtensionsInputSchema)
    .use(workspaceMiddleware)
    .query(async ({ input }): Promise<{ items: ExtensionListItem[]; total: number }> => {
      // Simple queries can be inline
      const [items, total] = await Promise.all([
        prisma.extension.findMany({
          where: { workspaceId: input.workspaceId, type: input.type },
          take: input.limit,
          skip: input.offset,
          orderBy: { createdAt: "desc" },
        }),
        prisma.extension.count({ where: { workspaceId: input.workspaceId } }),
      ]);
      return { items, total };
    }),

  // Mutations use workspaceAdminMiddleware and delegate to service
  create: protectedProcedure
    .input(CreateExtensionInputSchema)
    .use(workspaceAdminMiddleware)
    .mutation(async ({ ctx, input }) => {
      return ExtensionService.create(input, ctx.session.user.id);
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .use(workspaceAdminMiddleware)
    .mutation(async ({ ctx, input }) => {
      return ExtensionService.delete(input.id, ctx.session.user.id);
    }),
});
```

### Middleware Usage

| Middleware | Use Case |
|------------|----------|
| `protectedProcedure` | Requires authentication |
| `workspaceMiddleware` | Read access to workspace |
| `workspaceAdminMiddleware` | Admin access (OWNER, ADMIN roles) |
| `internalProcedure` | Worker/service-to-service calls |

---

## 3. Service Patterns

### Static Class Methods

```typescript
// packages/api/src/services/{domain}.service.ts
import { TRPCError } from "@trpc/server";
import { prisma, type Prisma } from "@cognobserve/db";
import type { CreateExtensionInput } from "../schemas/extensions";

export class ExtensionService {
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // PUBLIC METHODS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  static async create(input: CreateExtensionInput, userId: string) {
    // Check for duplicates
    const existing = await prisma.extension.findFirst({
      where: { workspaceId: input.workspaceId, name: input.name },
    });

    if (existing) {
      throw new TRPCError({
        code: "CONFLICT",
        message: `Extension "${input.name}" already exists`,
      });
    }

    // Use transaction for multi-step operations
    return prisma.$transaction(async (tx) => {
      const extension = await tx.extension.create({
        data: { ...input, createdById: userId },
      });

      await tx.auditLog.create({
        data: {
          action: "EXTENSION_CREATED",
          resourceType: "EXTENSION",
          resourceId: extension.id,
          userId,
          workspaceId: input.workspaceId,
        },
      });

      return extension;
    });
  }

  static async delete(id: string, userId: string) {
    // Atomic delete - don't check existence first
    try {
      await prisma.extension.delete({ where: { id } });
    } catch (error) {
      if ((error as { code?: string }).code === "P2025") {
        throw new TRPCError({ code: "NOT_FOUND", message: "Extension not found" });
      }
      throw error;
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // PRIVATE HELPERS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  private static readonly detailInclude = {
    createdBy: { select: { id: true, name: true } },
  } satisfies Prisma.ExtensionInclude;
}
```

---

## 4. Frontend Hook Patterns

### Domain Hook Structure

```typescript
// apps/web/src/hooks/use-{domain}.ts
"use client";

import { useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { showError } from "@/lib/errors";
import { extensionToast } from "@/lib/success";
import type { CreateExtensionInput } from "@cognobserve/api/schemas";

// Define return type interface
interface UseExtensions {
  extensions: ExtensionListItem[];
  total: number;
  isLoading: boolean;
  error: Error | null;
  createExtension: (input: Omit<CreateExtensionInput, "workspaceId">) => Promise<void>;
  deleteExtension: (id: string) => Promise<void>;
  isCreating: boolean;
  isDeleting: boolean;
  refetch: () => void;
}

export function useExtensions(workspaceId: string): UseExtensions {
  const utils = trpc.useUtils();

  // Query
  const { data, isLoading, error, refetch } = trpc.extensions.list.useQuery(
    { workspaceId },
    { staleTime: 30_000 }
  );

  // Mutations with cache invalidation
  const createMutation = trpc.extensions.create.useMutation({
    onSuccess: (result) => {
      extensionToast.created(result.name);
      utils.extensions.list.invalidate({ workspaceId });
    },
    onError: showError,
  });

  const deleteMutation = trpc.extensions.delete.useMutation({
    onSuccess: () => {
      extensionToast.deleted();
      utils.extensions.list.invalidate({ workspaceId });
    },
    onError: showError,
  });

  // Wrapper functions with useCallback
  const createExtension = useCallback(
    async (input: Omit<CreateExtensionInput, "workspaceId">) => {
      await createMutation.mutateAsync({ ...input, workspaceId });
    },
    [createMutation, workspaceId]
  );

  const deleteExtension = useCallback(
    async (id: string) => {
      await deleteMutation.mutateAsync({ id });
    },
    [deleteMutation]
  );

  return {
    extensions: data?.items ?? [],
    total: data?.total ?? 0,
    isLoading,
    error: error ?? null,
    createExtension,
    deleteExtension,
    isCreating: createMutation.isPending,
    isDeleting: deleteMutation.isPending,
    refetch,
  };
}
```

---

## 5. Component Patterns

### List Component

```typescript
// apps/web/src/components/{domain}/{domain}-list.tsx
"use client";

import { useState, useCallback } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useExtensions } from "@/hooks/use-extensions";
import { ExtensionTable } from "./extension-table";
import { CreateExtensionDialog } from "./create-extension-dialog";

interface ExtensionListProps {
  workspaceId: string;
}

export function ExtensionList({ workspaceId }: ExtensionListProps) {
  // State
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  // Hook
  const { extensions, isLoading, createExtension, isCreating } = useExtensions(workspaceId);

  // Handlers (ALWAYS extract - no inline functions)
  const handleOpenCreate = useCallback(() => {
    setCreateDialogOpen(true);
  }, []);

  const handleCloseCreate = useCallback(() => {
    setCreateDialogOpen(false);
  }, []);

  const handleCreateSuccess = useCallback(async (input: CreateInput) => {
    await createExtension(input);
    setCreateDialogOpen(false);
  }, [createExtension]);

  // Loading state
  if (isLoading) {
    return <ExtensionListSkeleton />;
  }

  // Render
  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Extensions</CardTitle>
          <Button onClick={handleOpenCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Add Extension
          </Button>
        </CardHeader>
        <CardContent>
          <ExtensionTable extensions={extensions} />
        </CardContent>
      </Card>

      <CreateExtensionDialog
        open={createDialogOpen}
        onOpenChange={handleCloseCreate}
        onSubmit={handleCreateSuccess}
        isSubmitting={isCreating}
      />
    </>
  );
}
```

### Dialog Component

```typescript
// apps/web/src/components/{domain}/create-{domain}-dialog.tsx
"use client";

import { useState, useCallback } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EXTENSION_TYPES, EXTENSION_TYPE_LABELS } from "@cognobserve/api/schemas";

interface CreateExtensionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: { name: string; type: string }) => Promise<void>;
  isSubmitting: boolean;
}

export function CreateExtensionDialog({
  open,
  onOpenChange,
  onSubmit,
  isSubmitting,
}: CreateExtensionDialogProps) {
  const [name, setName] = useState("");
  const [type, setType] = useState<string>("");

  // Handlers
  const handleNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setName(e.target.value);
  }, []);

  const handleTypeChange = useCallback((value: string) => {
    setType(value);
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit({ name, type });
    setName("");
    setType("");
  }, [name, type, onSubmit]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create Extension</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={handleNameChange}
                disabled={isSubmitting}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="type">Type</Label>
              <Select value={type} onValueChange={handleTypeChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {EXTENSION_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {EXTENSION_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

---

## 6. Toast Patterns

### Error Handling (`apps/web/src/lib/errors.ts`)

```typescript
import { toast } from "sonner";

// Generic error handler - extracts and shows error
export function showError(error: unknown): void {
  const { title, message } = extractErrorInfo(error);
  toast.error(title, { description: message });
}

// Domain-specific error objects
export const extensionError = {
  notFound: () =>
    toast.error("Extension Not Found", { description: "This extension doesn't exist." }),
  alreadyExists: (name: string) =>
    toast.error("Extension Exists", { description: `"${name}" already exists.` }),
} as const;
```

### Success Toasts (`apps/web/src/lib/success.ts`)

```typescript
import { toast } from "sonner";

// Domain-specific toast objects
export const extensionToast = {
  created: (name: string) =>
    toast.success("Extension Created", { description: `"${name}" has been created.` }),
  updated: (name?: string) =>
    toast.success("Extension Updated", { description: name ? `"${name}" updated.` : undefined }),
  deleted: (name?: string) =>
    toast.success("Extension Deleted", { description: name ? `"${name}" deleted.` : undefined }),
} as const;
```

---

## 7. Test Patterns

### Test File Structure

```typescript
// packages/api/src/routers/__tests__/{domain}.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TRPCError } from "@trpc/server";
import { createCallerFactory } from "../../trpc";

// Mock BEFORE imports
vi.mock("@cognobserve/db", () => ({
  prisma: {
    extension: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    $transaction: vi.fn((fn) => fn(prisma)),
  },
}));

import { prisma } from "@cognobserve/db";
import { extensionsRouter } from "../extensions";

// Fixtures
const MOCK_USER = { id: "user_123", name: "Test User", email: "test@example.com" };
const MOCK_WORKSPACE = { id: "ws_123", slug: "test-workspace", role: "OWNER" };
const MOCK_SESSION = { user: MOCK_USER, workspaces: [MOCK_WORKSPACE] };
const MOCK_EXTENSION = { id: "ext_123", name: "Test", type: "THEME", createdAt: new Date() };

// Helper
const createTestCaller = (session = MOCK_SESSION) => {
  const createCaller = createCallerFactory(extensionsRouter);
  return createCaller({ session });
};

describe("extensionsRouter", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  describe("list", () => {
    it("returns list of extensions", async () => {
      const caller = createTestCaller();
      vi.mocked(prisma.extension.findMany).mockResolvedValue([MOCK_EXTENSION]);
      vi.mocked(prisma.extension.count).mockResolvedValue(1);

      const result = await caller.list({ workspaceId: MOCK_WORKSPACE.id });

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it("requires authentication", async () => {
      const caller = createTestCaller(null);
      await expect(caller.list({ workspaceId: MOCK_WORKSPACE.id })).rejects.toThrow(TRPCError);
    });
  });

  describe("create", () => {
    it("creates extension with valid input", async () => {
      const caller = createTestCaller();
      vi.mocked(prisma.extension.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.extension.create).mockResolvedValue(MOCK_EXTENSION);

      const result = await caller.create({
        workspaceId: MOCK_WORKSPACE.id,
        name: "New Extension",
        type: "THEME",
      });

      expect(result.id).toBe(MOCK_EXTENSION.id);
    });

    it("requires admin role", async () => {
      const memberSession = {
        ...MOCK_SESSION,
        workspaces: [{ ...MOCK_WORKSPACE, role: "MEMBER" }],
      };
      const caller = createTestCaller(memberSession);

      await expect(
        caller.create({ workspaceId: MOCK_WORKSPACE.id, name: "Test", type: "THEME" })
      ).rejects.toThrow(TRPCError);
    });
  });
});
```

---

## 8. Temporal Worker Patterns

### Activity Pattern (READ-ONLY)

```typescript
// apps/worker/src/temporal/activities/{domain}.activities.ts
import { prisma } from "@cognobserve/db";
import { getInternalCaller } from "@/lib/trpc-caller";

// ✅ READ operations are allowed
export async function getExtension(id: string) {
  return prisma.extension.findUnique({
    where: { id },
    select: { id: true, name: true, type: true, config: true },
  });
}

// ✅ Mutations go through tRPC internal caller
export async function createExtension(input: CreateInput) {
  const caller = getInternalCaller();
  return caller.internal.createExtension(input);
}

// ❌ NEVER do direct mutations
// export async function createExtension(input: CreateInput) {
//   return prisma.extension.create({ data: input }); // FORBIDDEN
// }
```

### Internal Router Procedures

```typescript
// packages/api/src/routers/internal.ts
import { internalProcedure } from "../trpc";

export const internalRouter = createTRPCRouter({
  createExtension: internalProcedure
    .input(CreateExtensionInternalSchema)
    .mutation(async ({ input }) => {
      return prisma.extension.create({ data: input });
    }),
});
```

---

## 9. Database Migration Pattern

### ALWAYS Create Migrations

```bash
# After ANY change to packages/db/prisma/schema/*.prisma
pnpm db:migrate --name {descriptive_name}

# Examples:
pnpm db:migrate --name add_extensions_table
pnpm db:migrate --name add_user_preferences
```

### Migration Naming

- Use `snake_case`: `add_extensions_table`
- Be descriptive: `add_user_avatar_column`
- Group related: `add_eval_suite_tables`

---

## 10. Import Patterns

### Correct Import Sources

| Import | Source |
|--------|--------|
| Database types | `import { type Project } from "@cognobserve/db"` |
| Prisma client | `import { prisma } from "@cognobserve/db"` |
| Zod schemas | `import { ProjectRoleSchema } from "@cognobserve/api/schemas"` |
| tRPC routers | `import { appRouter } from "@cognobserve/api"` |
| Shared utilities | `import { ACTIVITY_RETRY } from "@cognobserve/shared"` |
| LLM (activities only) | `import { getLLM } from "@cognobserve/shared/llm"` |

### Frontend Client-Safe Imports

```typescript
// For client components (avoid server-side deps)
import { EXTENSION_TYPES, ExtensionTypeSchema } from "@cognobserve/api/schemas";

// NOT from main package
// import { ... } from "@cognobserve/api";  // Has server deps
```
