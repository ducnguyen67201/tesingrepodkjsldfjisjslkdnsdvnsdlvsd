# Coding Standards

## Philosophy

**Ship fast. Ship right. Don't ship twice.**

These standards prioritize:
1. **Velocity** - Less code = faster shipping = fewer bugs
2. **Clarity** - Code is read 10x more than written
3. **Simplicity** - The best code is no code; the second best is obvious code

---

## TypeScript Standards

### File Organization

```
src/
├── app/                    # Next.js App Router pages
├── components/
│   ├── ui/                 # shadcn/ui components (don't modify)
│   └── [feature]/          # Feature-specific components
├── hooks/                  # Custom React hooks
├── lib/
│   ├── constants/          # Shared constants
│   ├── utils/              # Pure utility functions
│   └── env.ts              # Environment variables
└── types/                  # TypeScript type definitions
```

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Files | kebab-case | `use-projects.ts` |
| Components | PascalCase | `ProjectCard` |
| Functions | camelCase | `fetchProjects` |
| Constants | UPPER_SNAKE | `MAX_RETRIES` |
| Types/Interfaces | PascalCase | `Project`, `ApiResponse` |
| Hooks | camelCase with `use` | `useProjects` |
| Event handlers | camelCase with `handle` | `handleClick` |

### Component Structure

```tsx
// 1. Imports (grouped: external, internal, types)
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { Project } from "@/types";

// 2. Constants (module level)
const MAX_ITEMS = 10;

// 3. Types (if component-specific)
interface ProjectListProps {
  projects: Project[];
  onSelect: (id: string) => void;
}

// 4. Component
export function ProjectList({ projects, onSelect }: ProjectListProps) {
  // 4a. Hooks first
  const [selected, setSelected] = useState<string | null>(null);

  // 4b. Derived state (no useMemo unless proven needed)
  const visibleProjects = projects.slice(0, MAX_ITEMS);

  // 4c. Event handlers
  const handleSelect = (id: string) => {
    setSelected(id);
    onSelect(id);
  };

  // 4d. Render helpers (for map callbacks)
  const renderProject = (project: Project) => (
    <ProjectCard
      key={project.id}
      project={project}
      onSelect={handleSelect}
    />
  );

  // 4e. Early returns for loading/error/empty
  if (projects.length === 0) {
    return <EmptyState />;
  }

  // 4f. Main render
  return (
    <div className="grid gap-4">
      {visibleProjects.map(renderProject)}
    </div>
  );
}
```

### Hook Standards

```tsx
// src/hooks/use-projects.ts
import { useState, useEffect, useCallback } from "react";
import type { Project } from "@/types";

interface UseProjectsReturn {
  projects: Project[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function useProjects(): UseProjectsReturn {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchProjects = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/projects");
      if (!response.ok) throw new Error("Failed to fetch");
      const data = await response.json();
      setProjects(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Unknown error"));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  return { projects, isLoading, error, refetch: fetchProjects };
}
```

### Type Safety

```tsx
// Prefer discriminated unions
type ApiResult<T> =
  | { status: "success"; data: T }
  | { status: "error"; error: string }
  | { status: "loading" };

// Avoid
type BadResult<T> = {
  data?: T;
  error?: string;
  loading?: boolean;
};

// Use const assertions for literal types
const STATUSES = ["active", "inactive", "pending"] as const;
type Status = (typeof STATUSES)[number];

// Prefer unknown over any
function parseJson(input: string): unknown {
  return JSON.parse(input);
}

// Use satisfies for type checking without widening
const config = {
  apiUrl: "https://api.example.com",
  timeout: 5000,
} satisfies Record<string, string | number>;
```

### Environment Variables

```tsx
// Always use env.ts, never process.env directly
import { env } from "@/lib/env";

// Good
const apiUrl = env.NEXT_PUBLIC_API_URL;

// Bad
const apiUrl = process.env.NEXT_PUBLIC_API_URL;
```

---

## Go Standards

### File Organization

```
apps/ingest/
├── cmd/ingest/             # Entry point (main.go)
└── internal/
    ├── config/             # Configuration loading
    ├── handler/            # HTTP handlers
    ├── middleware/         # HTTP middleware
    ├── model/              # Internal domain models
    ├── queue/              # Redis queue producer
    ├── server/             # HTTP server setup
    └── proto/ducsigrv1/ # Generated protobuf types
```

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Packages | lowercase, single word | `handler`, `config` |
| Exported | PascalCase | `TraceHandler` |
| Unexported | camelCase | `validateRequest` |
| Constants | PascalCase or UPPER_SNAKE | `MaxRetries`, `MAX_RETRIES` |
| Interfaces | PascalCase, no `I` prefix | `Repository`, not `IRepository` |

### Error Handling

```go
// Always wrap errors with context
func (h *Handler) CreateTrace(w http.ResponseWriter, r *http.Request) {
    trace, err := h.parseRequest(r)
    if err != nil {
        // Wrap with context
        h.handleError(w, fmt.Errorf("parsing request: %w", err))
        return
    }

    if err := h.repo.Save(r.Context(), trace); err != nil {
        h.handleError(w, fmt.Errorf("saving trace: %w", err))
        return
    }
}

// Use sentinel errors for known conditions
var (
    ErrNotFound      = errors.New("not found")
    ErrUnauthorized  = errors.New("unauthorized")
    ErrInvalidInput  = errors.New("invalid input")
)

// Check with errors.Is
if errors.Is(err, ErrNotFound) {
    w.WriteHeader(http.StatusNotFound)
    return
}
```

### Context Usage

```go
// Always propagate context
func (s *Service) Process(ctx context.Context, data []byte) error {
    // Check for cancellation
    select {
    case <-ctx.Done():
        return ctx.Err()
    default:
    }

    // Pass context to all downstream calls
    return s.repo.Save(ctx, data)
}
```

### Handler Structure

```go
func (h *Handler) CreateTrace(w http.ResponseWriter, r *http.Request) {
    ctx := r.Context()

    // 1. Parse and validate request
    var req pb.CreateTraceRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        h.respondError(w, http.StatusBadRequest, "invalid json")
        return
    }

    if err := h.validate(&req); err != nil {
        h.respondError(w, http.StatusBadRequest, err.Error())
        return
    }

    // 2. Execute business logic
    trace, err := h.service.CreateTrace(ctx, &req)
    if err != nil {
        h.handleError(w, err)
        return
    }

    // 3. Return response
    h.respondJSON(w, http.StatusCreated, trace)
}
```

---

## UI Standards (shadcn/ui)

### Component Usage

```tsx
// Always import from @/components/ui
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

// Use semantic variants
<Button variant="default">Primary</Button>    // Yellow theme
<Button variant="secondary">Secondary</Button>
<Button variant="destructive">Delete</Button>
<Button variant="outline">Outlined</Button>
<Button variant="ghost">Ghost</Button>
<Button variant="link">Link</Button>
```

### Class Merging

```tsx
import { cn } from "@/lib/utils";

// Use cn() to merge classes
<Button className={cn("w-full", isActive && "ring-2")} />

// For conditional classes
<Card className={cn(
  "transition-all",
  isSelected && "border-primary",
  isDisabled && "opacity-50 pointer-events-none"
)} />
```

### Adding New Components

```bash
# Run from apps/web directory
pnpm dlx shadcn@latest add [component-name]

# Examples
pnpm dlx shadcn@latest add dialog
pnpm dlx shadcn@latest add dropdown-menu
pnpm dlx shadcn@latest add toast
```

---

## Database Standards

### Prisma Schema

```prisma
// packages/db/prisma/schema.prisma

model Project {
  id        String   @id @default(cuid())
  name      String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  // Relations
  traces    Trace[]
  apiKeys   ApiKey[]

  // Indexes
  @@index([createdAt])
}
```

### Query Patterns

```tsx
// Always use select to limit fields
const project = await prisma.project.findUnique({
  where: { id },
  select: {
    id: true,
    name: true,
    // Only what you need
  },
});

// Use include sparingly, prefer separate queries
// for large relations

// Always paginate
const traces = await prisma.trace.findMany({
  where: { projectId },
  take: 20,
  skip: page * 20,
  orderBy: { createdAt: "desc" },
});
```

---

## Proto Standards

### Defining Messages

```protobuf
// proto/ducsigr/v1/trace.proto

syntax = "proto3";

package ducsigr.v1;

message Trace {
  string id = 1;
  string project_id = 2;
  google.protobuf.Timestamp created_at = 3;

  // Use snake_case for field names
  // Use singular for repeated fields
  repeated Span span = 4;
}
```

### After Modifying Proto

```bash
# Always run after editing .proto files
make proto

# Verify generated files
ls packages/proto/src/generated/
ls apps/ingest/internal/proto/ducsigrv1/
```

---

## Git Standards

### Commit Messages

```
<type>: <description>

[optional body]

[optional footer]
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `refactor`: Code change that neither fixes nor adds
- `docs`: Documentation only
- `test`: Adding tests
- `chore`: Maintenance tasks

```bash
# Good
feat: add trace filtering by date range
fix: resolve race condition in queue processing
refactor: extract validation logic to separate module

# Bad
update code
fix bug
wip
```

### Branch Naming

```
<type>/<short-description>

# Examples
feat/trace-filtering
fix/queue-race-condition
refactor/validation-module
```

---

## Testing Standards

### Test File Location

```
src/
├── components/
│   └── project-card/
│       ├── project-card.tsx
│       └── project-card.test.tsx  # Co-located
└── lib/
    └── utils/
        ├── format.ts
        └── format.test.ts         # Co-located
```

### Test Structure

```tsx
describe("ProjectCard", () => {
  // Group by functionality
  describe("rendering", () => {
    it("displays project name", () => {});
    it("shows status badge", () => {});
  });

  describe("interactions", () => {
    it("calls onSelect when clicked", () => {});
    it("shows menu on right click", () => {});
  });

  describe("edge cases", () => {
    it("handles missing optional fields", () => {});
    it("truncates long names", () => {});
  });
});
```

---

## Performance Guidelines

### React Performance

```tsx
// Only use useMemo/useCallback when proven necessary
// Measure first with React DevTools Profiler

// Virtualize long lists
import { useVirtualizer } from "@tanstack/react-virtual";

// Lazy load heavy components
const HeavyChart = lazy(() => import("./heavy-chart"));
```

### Go Performance

```go
// Preallocate slices when size is known
items := make([]Item, 0, expectedSize)

// Use sync.Pool for frequent allocations
var bufPool = sync.Pool{
    New: func() interface{} {
        return new(bytes.Buffer)
    },
}

// Avoid defer in hot loops
for _, item := range items {
    // Don't use defer here
    process(item)
}
```

---

## Quick Reference Card

| Topic | Do | Don't |
|-------|-----|-------|
| JSX Functions | `onClick={handleClick}` | `onClick={() => {}}` |
| Constants | `const MAX_ITEMS = 10` | `const maxItems = 10` |
| Env Vars | `env.API_URL` | `process.env.API_URL` |
| UI Components | `<Button />` from shadcn | Custom CSS buttons |
| Types | `unknown` | `any` |
| Go Errors | `fmt.Errorf("x: %w", err)` | `return err` |
| Proto Changes | Run `make proto` | Edit generated files |
| Database | Use Prisma | Raw SQL (usually) |
