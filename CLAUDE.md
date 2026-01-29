# QA - Claude Code Context

## Project Overview
QA is a T3-style monorepo for building full-stack applications with type safety across the entire stack.

## Tech Stack
- **Monorepo**: pnpm 9.15 workspaces + Turborepo 2.3
- **Web**: Next.js 16, React 19, TypeScript 5.7, Tailwind CSS 4
- **Database**: PostgreSQL 17 with pgvector (embeddings) + Prisma 7
- **Cache**: Redis 7
- **Validation**: Zod 4
- **Containerization**: Docker Compose

## Project Structure
```
QA/
├── apps/
│   ├── web/                     # Next.js app
│   │   └── src/
│   │       ├── app/             # App Router pages
│   │       ├── components/      # React components
│   │       ├── hooks/           # Custom hooks
│   │       ├── lib/             # Utilities
│   │       └── trpc/            # tRPC client
│   └── worker/                  # Background worker (if needed)
├── packages/
│   ├── shared/                  # Shared types, Zod schemas, utilities
│   │   └── src/
│   │       ├── schemas/         # Zod schemas (source of truth)
│   │       └── utils/           # Shared utilities
│   └── db/                      # Prisma schema & client
│       ├── prisma/
│       │   └── schema.prisma
│       └── src/
├── tooling/
│   ├── eslint/                  # Shared ESLint config
│   └── typescript/              # Shared TypeScript config
├── docker-compose.yml
├── turbo.json
└── pnpm-workspace.yaml
```

## Commands

### Development
```bash
pnpm install              # Install dependencies
docker compose up -d      # Start PostgreSQL + Redis
cp .env.example .env      # Copy environment file
pnpm db:generate          # Generate Prisma client
pnpm db:push              # Push schema to database
pnpm dev                  # Start all apps
```

### Database
```bash
pnpm db:generate          # Generate Prisma client
pnpm db:migrate           # Run migrations
pnpm db:push              # Push schema without migration
pnpm db:studio            # Open Prisma Studio
```

## Services

| Service | Port | Purpose |
|---------|------|---------|
| Web | 3000 | Next.js app |
| PostgreSQL | 5432 | Database (with pgvector) |
| Redis | 6379 | Cache |

---

# Code Style Rules (CRITICAL)

## No Inline Functions
- **Never use inline arrow functions in JSX** - Extract to named functions or handlers
- Define event handlers outside JSX: `const handleClick = () => {}` not `onClick={() => {}}`
- Extract callbacks passed to hooks

```tsx
// ❌ BAD
<Button onClick={() => setOpen(true)}>Open</Button>
{items.map((item) => <Item key={item.id} {...item} />)}

// ✅ GOOD
const handleOpen = () => setOpen(true);
const renderItem = (item: Item) => <Item key={item.id} {...item} />;

<Button onClick={handleOpen}>Open</Button>
{items.map(renderItem)}
```

## Constants
- **Use UPPER_SNAKE_CASE for constants**
- Define constants at module level, not inside components
- For complex/shared constants, create a dedicated `constants.ts` file

```tsx
// Simple constants - top of file
const MAX_ITEMS = 10;
const API_TIMEOUT = 5000;

// Complex constants - separate file
export const NAV_ITEMS = [
  { title: "Dashboard", href: "/", icon: LayoutDashboard },
] as const;

export const ERROR_MESSAGES = {
  UNAUTHORIZED: "You must be logged in",
  NOT_FOUND: "Resource not found",
} as const;
```

## Zod Schemas as Source of Truth
- **Define types as Zod schemas first** - Infer TypeScript types from schemas
- **Store schemas in `packages/shared/src/schemas/`** - Centralized location
- **Never hardcode constants for enums/unions** - Define as Zod schema
- **Export both schema and inferred type**

```typescript
// ❌ BAD - Hardcoded constants without schema
export const ROLES = ["OWNER", "ADMIN", "MEMBER"] as const;

// ✅ GOOD - Zod schema as source of truth
// packages/shared/src/schemas/roles.ts
import { z } from "zod";

export const roleSchema = z.enum(["OWNER", "ADMIN", "MEMBER"]);
export type Role = z.infer<typeof roleSchema>;

// Derive constants from schema
export const ALL_ROLES: readonly Role[] = roleSchema.options;
```

## Zod for Runtime Validation (MANDATORY)
**ALL unknown data MUST be validated through Zod. No exceptions.**

Type assertions (`as`) are FORBIDDEN for unknown data.

```typescript
// ❌ FORBIDDEN - Type assertion
const response = await fetch("/api/data");
const data = (await response.json()) as { users: User[] };

// ✅ REQUIRED - Zod validation
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
  return null;
}

const data = parsed.data; // Safe to use
```

**When Zod is required:**
| Scenario | Required? |
|----------|-----------|
| External API response | ✅ MANDATORY |
| `JSON.parse()` result | ✅ MANDATORY |
| URL query params | ✅ MANDATORY |
| WebSocket messages | ✅ MANDATORY |
| Database results | ❌ Prisma types are safe |
| Internal function params | ❌ TypeScript handles it |

---

# Frontend Best Practices

## Function Decomposition
- **Break large functions into smaller, focused functions** - Each function does ONE thing
- **Functions over 20-30 lines are candidates for splitting**
- **Pure functions are preferred** - Same input = same output

```tsx
// ❌ BAD - Monolithic function
function handleSubmit(data: FormData) {
  // 50+ lines of validation, API calls, state updates...
}

// ✅ GOOD - Decomposed
const validateEmail = (email: string): string | null => {
  if (!email) return "Email is required";
  if (!email.includes("@")) return "Invalid email format";
  return null;
};

const validatePassword = (password: string): string[] => {
  const errors: string[] = [];
  if (password.length < 8) errors.push("Min 8 characters");
  return errors;
};

export const validateForm = (data: FormData): string[] => {
  const errors: string[] = [];
  const emailError = validateEmail(data.email);
  if (emailError) errors.push(emailError);
  errors.push(...validatePassword(data.password));
  return errors;
};
```

## Shared Utilities
- **Create reusable utilities in `src/lib/`** or `packages/shared/src/utils/`
- **Utilities must be pure functions** - No React hooks, no side effects

```tsx
// packages/shared/src/utils/format.ts
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
```

## Component Optimization
- **Use React.memo for expensive pure components**
- **Use useMemo for expensive computations**
- **Use useCallback for stable function references**
- **Lazy load heavy components** with `next/dynamic`

```tsx
// ✅ GOOD - Optimized
const ItemRow = memo(function ItemRow({ item, onClick }: Props) {
  return <div onClick={onClick}>{item.name}</div>;
});

function ItemList({ items, filter }: Props) {
  const filteredItems = useMemo(() => {
    return items.filter((i) => i.status === filter);
  }, [items, filter]);

  const handleClick = useCallback((id: string) => {
    router.push(`/items/${id}`);
  }, [router]);

  return filteredItems.map((item) => (
    <ItemRow key={item.id} item={item} onClick={() => handleClick(item.id)} />
  ));
}
```

## URL State Synchronization
- **Sync UI state to URL query params** - Panels, modals, tabs, filters
- **Enable shareable/bookmarkable state**

```tsx
// ✅ GOOD - State synced to URL
function Panel() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const isOpen = searchParams.get("panel") === "open";

  const handleOpenChange = useCallback((open: boolean) => {
    const params = new URLSearchParams(searchParams.toString());
    if (open) {
      params.set("panel", "open");
    } else {
      params.delete("panel");
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [searchParams, pathname, router]);

  return <Sheet open={isOpen} onOpenChange={handleOpenChange} />;
}
```

## Prevent Race Conditions
- **Never use check-then-act patterns**
- **Use atomic operations**

```typescript
// ❌ BAD - Race condition
const record = await prisma.item.findFirst({ where: { id } });
if (!record) throw new Error("Not found");
await prisma.item.delete({ where: { id } });

// ✅ GOOD - Atomic operation
try {
  await prisma.item.delete({ where: { id } });
} catch (e) {
  if (e.code === "P2025") throw new Error("Not found");
  throw e;
}
```

---

# Architecture Patterns

## Shared Type Packages - Single Source of Truth
**ALWAYS use shared type packages.** Never duplicate types across apps.

```
┌─────────────────────────────────────────────────────────────────────┐
│                    TYPE FLOW (Single Source of Truth)               │
└─────────────────────────────────────────────────────────────────────┘

    packages/shared/src/schemas/        packages/db/prisma/schema.prisma
    (Zod schemas)                       (Database models)
          │                                    │
          ▼                                    ▼
┌──────────────────────┐              ┌──────────────────────┐
│     @t3/shared       │              │       @t3/db         │
│  (Zod types)         │              │  (Prisma Client)     │
└──────────────────────┘              └──────────────────────┘
          │                                    │
          └──────────────┬─────────────────────┘
                         ▼
              ┌──────────────────────┐
              │      apps/web        │
              │   (Next.js App)      │
              └──────────────────────┘

RULE: Always import from shared packages, NEVER duplicate types!
```

```tsx
// ❌ BAD - Duplicating types
interface User {
  id: string;
  name: string;
}

// ✅ GOOD - Use shared packages
import { type User } from "@t3/db";
import { createUserSchema, type CreateUserInput } from "@t3/shared";
```

## File Size Rule
- **Keep files under 150-200 lines**
- **One component per file**
- **One hook per file**

## Frontend Directory Structure
```
apps/web/src/
├── app/                      # Next.js App Router pages
├── components/
│   ├── ui/                   # UI primitives (shadcn)
│   ├── users/                # Domain: User components
│   ├── posts/                # Domain: Post components
│   └── shared/               # Cross-domain components
├── hooks/
│   ├── use-users.ts          # Domain hooks
│   └── use-debounce.ts       # Utility hooks
├── lib/
│   ├── format.ts             # Formatting utilities
│   └── utils.ts              # General utilities
└── trpc/                     # tRPC client setup
```

## Component Architecture Pattern
```tsx
// ❌ BAD - Fat component
function UsersPage() {
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  // 200+ lines of logic and JSX...
}

// ✅ GOOD - Thin component + domain hook
// hooks/use-users.ts
export function useUsers() {
  const { data, isLoading, error } = api.user.list.useQuery();
  return { users: data ?? [], isLoading, error };
}

// components/users/users-page.tsx (< 50 lines)
export function UsersPage() {
  const { users, isLoading, error } = useUsers();

  if (error) return <ErrorState error={error} />;
  if (isLoading) return <UsersSkeleton />;

  return (
    <div>
      <PageHeader title="Users" />
      <UserList users={users} />
    </div>
  );
}
```

## Backend: Router → Service Pattern
Routers are thin. Business logic lives in services.

```tsx
// ❌ BAD - Fat router
export const userRouter = router({
  create: procedure.input(schema).mutation(async ({ ctx, input }) => {
    // 50 lines of business logic...
  }),
});

// ✅ GOOD - Thin router + service
// routers/user.ts
export const userRouter = router({
  create: procedure
    .input(createUserSchema)
    .mutation(({ ctx, input }) => UserService.create(ctx.db, input)),
});

// services/user.service.ts
export class UserService {
  static async create(db: PrismaClient, input: CreateUserInput) {
    return db.user.create({ data: input });
  }
}
```

---

# Database Migrations (CRITICAL)

**ALWAYS create a migration when editing Prisma schemas.**

```bash
# After ANY change to packages/db/prisma/schema.prisma
pnpm db:migrate --name <descriptive_name>

# Examples:
pnpm db:migrate --name add_user_avatar
pnpm db:migrate --name create_posts_table
```

**Migration naming:**
- Use snake_case: `add_user_avatar`, NOT `addUserAvatar`
- Be descriptive: `add_embedding_column`, NOT `update`

---

# Quick Reference

## Critical Rules
| Rule | Do | Don't |
|------|-----|-------|
| **Types** | Import from `@t3/db`, `@t3/shared` | Duplicate types |
| **Unknown Data** | Use Zod `safeParse()` | Type assertions (`as`) |
| **Components** | < 150 lines, logic in hooks | Fat components |
| **Inline Functions** | Extract to named handlers | `onClick={() => {}}` |
| **Constants** | UPPER_SNAKE_CASE at module level | Inside components |
| **Migrations** | Run after schema changes | Edit without migration |

## Package Imports
```tsx
// Database types
import { db, type User, type Post } from "@t3/db";

// Zod schemas
import { createUserSchema, type CreateUserInput } from "@t3/shared";
```
